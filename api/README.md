# Document Repository

## Project Description

A web application for uploading, viewing, downloading, and managing documents.
Users can organize files by date and access recent uploads easily.

## Features

- Upload files
- View documents in browser
- Download files
- Delete files
- Group files by month and day
- Recent uploads section
- User authentication
- Admin user management

## Tech Stack

- Node.js
- Express.js
- MongoDB
- EJS
- Multer (file uploads)
- bcrypt (password hashing)

## Project Structure

- **`config/`**: Contains the configuration for the session
- **`controllers/`**: Contains the controller functions that connect the database to the frontend
- **`database/`**: Contains the database function that connects and returns the database
- **`models/`**: Contains Classes and Methods that manage and manipulate data
- **`public/`**: Contains all static files that are rendered to the frontend
- **`routes/`**: Contains _Router_ methods that point to controller methods for specific urls
- **`views/`**: Contains all frontend ejs files
- **`app.js`**: All code link Back to this file

## Setup Instructions

1. **Clone the repository**:

   ```bash
   git clone https://github.com/Akene-Uzezi/Document-Repository.git
   cd Document-Repository
   ```

2. **Install dependencies**:
   Run:

   ```bash
   npm install
   ```

3. **Create a .env file**

   ```bash
   dbName = 'databaseName'
   uri = 'database url'
   sessionSecret = 'sessionkey'
   AppPassword = 'apppassword'
   AdminEmail = 'example@example.com'
   ```

   ## How to Create App Password
   - You must have 2 step verification enabled on the google account you want to use
   - Go to your google account settings
   - Under App name, enter a name for your project
   - click create
   - Copy the 16 character code that shows in the modal

4. **Create an `uploads/` folder in the root directory**
   This is where user files will be stored
5. **Run the application**:
   Launch the application using the appropriate command:

   ```bash
   npm start
   ```

6. **Open in Browser**:
   http://localhost:3000

## Contributing

Feel free to contribute to this project! Please open issues or submit pull requests if you find any problems or have suggestions for improvements.
