# 📚 Bibliotheca — Library Management System

A full-stack **Library Management System** built with **Python (Flask)** for the backend and vanilla **HTML/CSS/JavaScript** for the frontend. Designed for college or institution libraries to manage book lending, calculate fines automatically, and generate financial reports.

---

## Features

- **Book Catalogue** — Browse all books with availability status, author, genre, and price.
- **Borrowing Interface** — Shows only available books; quick-pick chips for fast issuing.
- **Name-Based Returns** — Borrowers are looked up by name; handles multiple concurrent borrows.
- **Automated Fine Calculation** — ₹5/day after the 14-day due date; previewed before return.
- **Damage & Loss Penalties** — ₹150 flat fee for damaged books; 2× book price for lost books.
- **Case-Insensitive ID Handling** — Book IDs are stored and matched without case sensitivity.
- **Due Date Tracking** — Every borrow auto-sets a 14-day return deadline.
- **Financial Reporting** — Dashboard with total revenue, fines, penalties, and overdue list.
- **Manage Catalogue** — Add or remove books; deletion blocked if book is currently borrowed.
- **Transaction History** — Filterable log of all borrow/return events with full charge breakdown.

---

## Tech Stack

| Layer     | Technology                      |
|-----------|---------------------------------|
| Backend   | Python 3.10+, Flask, flask-cors |
| Frontend  | HTML5, CSS3, Vanilla JavaScript |
| Storage   | JSON flat-files (no database)   |
| Fonts     | Playfair Display, DM Sans, DM Mono (Google Fonts) |

---

## Project Structure

```
library-management-system/
│
├── app.py                  # Flask application — all API routes
├── requirements.txt        # Python dependencies
│
├── data/
│   ├── books.json          # Book catalogue (persistent)
│   └── transactions.json   # Borrow/return log (persistent)
│
├── templates/
│   └── index.html          # Single-page frontend
│
└── static/
    ├── style.css           # Styling — editorial / warm aesthetic
    └── script.js           # Frontend logic — API calls, DOM rendering
```

---

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/your-username/library-management-system.git
cd library-management-system
```

### 2. Create a virtual environment

```bash
python -m venv venv
source venv/bin/activate       # macOS / Linux
venv\Scripts\activate          # Windows
```

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

### 4. Run the application

```bash
python app.py
```

Open your browser and visit: **http://localhost:5000**

---

## API Reference

All endpoints return JSON with a `success` boolean and either `data` or `message`.

### Books

| Method | Endpoint                   | Description                        |
|--------|----------------------------|------------------------------------|
| GET    | `/api/books`               | Fetch entire catalogue             |
| GET    | `/api/books/available`     | Fetch only available books         |
| POST   | `/api/books`               | Add a new book                     |
| DELETE | `/api/books/<book_id>`     | Remove a book (if not borrowed)    |

### Borrowing & Returns

| Method | Endpoint         | Description                              |
|--------|------------------|------------------------------------------|
| POST   | `/api/borrow`    | Issue a book to a borrower               |
| POST   | `/api/return`    | Return a book (name-based lookup)        |
| GET    | `/api/check-fine`| Preview overdue fine without returning   |

### Transactions & Reports

| Method | Endpoint              | Description                              |
|--------|-----------------------|------------------------------------------|
| GET    | `/api/transactions`   | All transactions (filterable by status)  |
| GET    | `/api/report`         | Financial summary + overdue list         |

---

## Fine & Penalty Policy

| Scenario       | Charge                        |
|----------------|-------------------------------|
| Overdue return | ₹5 per day past the due date  |
| Damaged book   | ₹5/day fine + ₹150 flat fee   |
| Lost book      | 2× the book's catalogue price |

---

## Sample Books (Pre-loaded)

The system ships with 8 sample books across Technology, Fiction, and Self-Help genres, all priced and ready to borrow.

---

## Screenshots

> Run the app and visit `http://localhost:5000` to see the full UI.

---

## License

MIT License. Free to use, modify, and distribute.

## 🌐 Live Demo
[https://bibliotheca-library-management.vercel.app](https://bibliotheca-library-management.vercel.app)
