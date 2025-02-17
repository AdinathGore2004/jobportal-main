require('dotenv').config();
const path = require("path");
const express = require("express");
const session = require("express-session");
const conn = require("./db/dbconn");

const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const ejsMate = require("ejs-mate");
const port = 3000;

// Set the view engine
app.engine("ejs", ejsMate);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Middleware to parse URL-encoded and JSON data
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Middleware to serve static files
app.use(express.static(path.join(__dirname, "/public")));

// Express-session configuration
app.use(session({
    secret: "mySecretKey",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }  // Set true if using HTTPS
}));

// Middleware to store user session in locals
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});

// Home route
app.get("/", (req, res) => {
    res.render("listings/home");
});

// Fetch all jobs from the database
app.get("/jobs", (req, res) => {
    const query = `
        SELECT jobs.*, users.id AS employer_id 
        FROM jobs 
        INNER JOIN users ON jobs.posted_by = users.id
        ORDER BY jobs.posted_at DESC`;

    conn.query(query, (err, results) => {
        if (err) {
            console.error("Error fetching jobs:", err);
            return res.status(500).send("Internal Server Error");
        }
        res.render("listings/jobs", { jobs: results, user: req.session.user });
    });
});

// Render Signup Page
app.get("/signup", (req, res) => {
    res.render("listings/signup");
});

// Handle User Signup (No password hashing)
app.post("/signup", (req, res) => {
    const { name, email, password, role, company_name } = req.body;

    if (!name || !email || !password || !role) {
        return res.status(400).send("All fields are required.");
    }

    // Check if user already exists
    const checkUserQuery = "SELECT * FROM users WHERE email = ?";
    conn.query(checkUserQuery, [email], (err, result) => {
        if (err) return res.status(500).send("Database Error");

        if (result.length > 0) {
            return res.status(400).send("User already exists. Try logging in.");
        }

        // Insert user into database
        const insertUserQuery =
            "INSERT INTO users (name, email, password, role, company_name) VALUES (?, ?, ?, ?, ?)";
        conn.query(insertUserQuery, [name, email, password, role, role === "employer" ? company_name : null], (err) => {
            if (err) return res.status(500).send("Database Error");
            res.redirect("/login");
        });
    });
});

// Render Login Page
app.get("/login", (req, res) => {
    res.render("listings/login");
});

// Handle User Login (No password hashing)
app.post("/login", (req, res) => {
    const { email, password, role } = req.body;

    if (!email || !password || !role) {
        return res.status(400).send("All fields are required.");
    }

    // Check user credentials
    const getUserQuery = "SELECT * FROM users WHERE email = ? AND password = ? AND role = ?";
    conn.query(getUserQuery, [email, password, role], (err, result) => {
        if (err) return res.status(500).send("Database Error");

        if (result.length === 0) {
            return res.status(400).send("Invalid email or password.");
        }

        req.session.user = result[0]; // Store user data in session
        res.redirect("/jobs");
    });
});

// Render Post Job Page (Only for Employers)
app.get("/post-job", (req, res) => {
    if (!req.session.user || req.session.user.role !== "employer") {
        return res.status(403).send("Access denied. Only employers can post jobs.");
    }
    res.render("listings/create", { user: req.session.user });
});

// Handle Job Posting (Only Employers Can Post Jobs)
app.post("/post-job", (req, res) => {
    if (!req.session.user || req.session.user.role !== "employer") {
        return res.status(403).send("Access denied. Only employers can post jobs.");
    }

    const { title, description, location, salary, job_type, experience_required, application_deadline, apply_link } = req.body;
    const company_name = req.session.user.company_name;
    const posted_by = req.session.user.id;

    // Ensure required fields are filled
    if (!title || !description || !location || !job_type || !application_deadline || !apply_link) {
        return res.status(400).send("All required fields must be filled.");
    }

    const insertJobQuery = `
        INSERT INTO jobs (title, description, company_name, location, salary, job_type, experience_required, posted_by, application_deadline, apply_link)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    conn.query(insertJobQuery, [title, description, company_name, location, salary, job_type, experience_required, posted_by, application_deadline, apply_link], (err) => {
        if (err) {
            console.error("Error posting job:", err); 
            return res.status(500).send("Database Error");
        
        }
            res.redirect("/jobs"); // Redirect to jobs page after posting
    });
});

// Edit Job route
app.get("/edit-job/:id", (req, res) => {
    if (!req.session.user || req.session.user.role !== "employer") {
        return res.status(403).send("Only Employer Can Edit Job.");
    }
    const jobId = req.params.id;
    const query = "SELECT * FROM jobs WHERE id = ?";

    conn.query(query, [jobId], (err, result) => {
        if (err) {
            console.error("Error fetching job:", err);
            return res.status(500).send("Internal Server Error");
        }
        res.render("listings/edit", { job: result[0] });
    });
});

// Update Job route
app.post("/update-job/:id", (req, res) => {
    if (!req.session.user || req.session.user.role !== "employer") {
        return res.status(403).send("Only Employer Can Edit Job.");
    }
    const jobId = req.params.id;
    const { title, description, location, salary, job_type, experience_required, application_deadline, apply_link } = req.body;

    const updateJobQuery = `
        UPDATE jobs 
        SET title = ?, description = ?, location = ?, salary = ?, job_type = ?, experience_required = ?, application_deadline = ?, apply_link = ?
        WHERE id = ?`;

    conn.query(updateJobQuery, [title, description, location, salary, job_type, experience_required, application_deadline, apply_link, jobId], (err) => {
        if (err) {
            console.error("Error updating job:", err);
            return res.status(500).send("Internal Server Error");
        }
        res.redirect("/jobs");
    });
});

// Delete Route 
app.post("/delete-job/:id", (req, res) => {
    if (!req.session.user || req.session.user.role !== "employer") {
        return res.status(403).send("Only Employer Can Delete Job.");
    }
    const jobId = req.params.id;
    const deleteJobQuery = "DELETE FROM jobs WHERE id = ?";

    conn.query(deleteJobQuery, [jobId], (err) => {
        if (err) {
            console.error("Error deleting job:", err);
            return res.status(500).send("Internal Server Error");
        }
        res.redirect("/jobs");
    });
});


// Handle user logout
app.get("/logout", (req, res) => {
    req.session.destroy(() => {
        res.redirect("/login");
    });
});

// api route 
app.post('/generate', async (req, res) => {
    const { prompt } = req.body;

    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = await response.text();
        res.json({ text });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Server is listening
app.listen(port, () => {
    console.log(`Server running on port http://localhost:3000/`);
});
