import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

"""
Library Management System - Backend
Description: A full-featured library management system with fine calculation,
             damage/loss penalties, due date tracking, and financial reporting.
"""

import json
import shutil
import os
from typing import Optional
from datetime import datetime, timedelta
from flask import Flask, request, jsonify, render_template
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# ──────────────────────────────────────────────
#  Configuration
# ──────────────────────────────────────────────

BORROW_PERIOD_DAYS  = 14          # How many days a book can be kept
FINE_PER_DAY        = 5.0         # ₹5 per overdue day
DAMAGE_PENALTY      = 150.0       # Flat fee for returning a damaged book
LOSS_PENALTY_MULT   = 2.0         # Multiplier on book price for lost books

# Deploy-time read-only seed data (shipped with the repo)
SEED_DIR   = os.path.join(os.path.dirname(__file__), "data")

# Runtime writable directory — /tmp is always writable on Vercel/Lambda
TMP_DATA_DIR       = "/tmp/library_data"
BOOKS_FILE         = os.path.join(TMP_DATA_DIR, "books.json")
TRANSACTIONS_FILE  = os.path.join(TMP_DATA_DIR, "transactions.json")


def _init_data():
    """
    On first cold start, copy seed data from the read-only deploy directory
    into /tmp so we have a writable working copy.
    """
    os.makedirs(TMP_DATA_DIR, exist_ok=True)
    for fname in ("books.json", "transactions.json"):
        dest = os.path.join(TMP_DATA_DIR, fname)
        if not os.path.exists(dest):
            src = os.path.join(SEED_DIR, fname)
            if os.path.exists(src):
                shutil.copy2(src, dest)
            else:
                # Create empty fallback
                with open(dest, "w") as f:
                    json.dump([], f)


# Run once at import time (cold start)
_init_data()


# ──────────────────────────────────────────────
#  Helpers: File I/O
# ──────────────────────────────────────────────

def load_json(path: str) -> list:
    """Load a JSON file and return its contents as a list."""
    if not os.path.exists(path):
        return []
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_json(path: str, data: list) -> None:
    """Persist data to a JSON file with pretty printing."""
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=4, ensure_ascii=False)


# ──────────────────────────────────────────────
#  Helpers: Business Logic
# ──────────────────────────────────────────────

def find_book_by_id(book_id: str, books: list) -> Optional[dict]:
    """Return a book dict matching book_id (case-insensitive)."""
    target = book_id.strip().upper()
    for book in books:
        if book["book_id"].upper() == target:
            return book
    return None


def find_book_by_title(title: str, books: list) -> Optional[dict]:
    """Return a book dict matching title (case-insensitive)."""
    target = title.strip().lower()
    for book in books:
        if book["title"].lower() == target:
            return book
    return None


def calculate_fine(due_date_str: str) -> float:
    """
    Calculate the overdue fine for a borrowed book.
    Returns 0.0 if the book is returned on time.
    """
    due_date = datetime.strptime(due_date_str, "%Y-%m-%d").date()
    today    = datetime.now().date()
    overdue_days = (today - due_date).days
    if overdue_days <= 0:
        return 0.0
    return round(overdue_days * FINE_PER_DAY, 2)


def calculate_loss_penalty(book_price: float) -> float:
    """Calculate penalty for a lost book."""
    return round(book_price * LOSS_PENALTY_MULT, 2)


# ──────────────────────────────────────────────
#  Routes: Pages
# ──────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")


# ──────────────────────────────────────────────
#  Routes: Books
# ──────────────────────────────────────────────

@app.route("/api/books", methods=["GET"])
def get_all_books():
    """Return the full catalogue."""
    books = load_json(BOOKS_FILE)
    return jsonify({"success": True, "data": books}), 200


@app.route("/api/books/available", methods=["GET"])
def get_available_books():
    """Return only books that are currently not borrowed."""
    books     = load_json(BOOKS_FILE)
    available = [b for b in books if b.get("is_available", True)]
    return jsonify({"success": True, "data": available}), 200


@app.route("/api/books", methods=["POST"])
def add_book():
    """Add a new book to the catalogue."""
    payload = request.get_json()
    if not payload:
        return jsonify({"success": False, "message": "No data provided."}), 400

    required = ["book_id", "title", "author", "genre", "price"]
    missing  = [f for f in required if f not in payload or not str(payload[f]).strip()]
    if missing:
        return jsonify({"success": False, "message": f"Missing fields: {', '.join(missing)}"}), 400

    books = load_json(BOOKS_FILE)

    if find_book_by_id(payload["book_id"], books):
        return jsonify({"success": False, "message": "A book with this ID already exists."}), 409

    new_book = {
        "book_id":      payload["book_id"].strip().upper(),
        "title":        payload["title"].strip(),
        "author":       payload["author"].strip(),
        "genre":        payload["genre"].strip(),
        "price":        float(payload["price"]),
        "is_available": True,
        "borrowed_by":  None,
        "due_date":     None,
        "added_on":     datetime.now().strftime("%Y-%m-%d"),
    }

    books.append(new_book)
    save_json(BOOKS_FILE, books)
    return jsonify({"success": True, "message": "Book added successfully.", "data": new_book}), 201


@app.route("/api/books/<book_id>", methods=["DELETE"])
def delete_book(book_id: str):
    """Remove a book from the catalogue (only if not currently borrowed)."""
    books = load_json(BOOKS_FILE)
    book  = find_book_by_id(book_id, books)

    if not book:
        return jsonify({"success": False, "message": "Book not found."}), 404
    if not book["is_available"]:
        return jsonify({"success": False, "message": "Cannot delete a book that is currently borrowed."}), 400

    books = [b for b in books if b["book_id"].upper() != book_id.strip().upper()]
    save_json(BOOKS_FILE, books)
    return jsonify({"success": True, "message": "Book removed from catalogue."}), 200


# ──────────────────────────────────────────────
#  Routes: Borrowing
# ──────────────────────────────────────────────

@app.route("/api/borrow", methods=["POST"])
def borrow_book():
    payload = request.get_json()
    if not payload:
        return jsonify({"success": False, "message": "No data provided."}), 400

    book_id       = payload.get("book_id", "").strip()
    borrower_name = payload.get("borrower_name", "").strip()
    borrower_id   = payload.get("borrower_id", "").strip()

    if not all([book_id, borrower_name, borrower_id]):
        return jsonify({"success": False, "message": "book_id, borrower_name, and borrower_id are required."}), 400

    books = load_json(BOOKS_FILE)
    book  = find_book_by_id(book_id, books)

    if not book:
        return jsonify({"success": False, "message": "Book not found."}), 404
    if not book["is_available"]:
        return jsonify({"success": False, "message": f'"{book["title"]}" is already borrowed.'}), 400

    borrow_date = datetime.now().date()
    due_date    = borrow_date + timedelta(days=BORROW_PERIOD_DAYS)

    book["is_available"] = False
    book["borrowed_by"]  = {"name": borrower_name, "id": borrower_id}
    book["due_date"]     = due_date.strftime("%Y-%m-%d")
    save_json(BOOKS_FILE, books)

    transaction = {
        "txn_id":        f"TXN{datetime.now().strftime('%Y%m%d%H%M%S')}",
        "book_id":       book["book_id"],
        "book_title":    book["title"],
        "borrower_name": borrower_name,
        "borrower_id":   borrower_id,
        "borrow_date":   borrow_date.strftime("%Y-%m-%d"),
        "due_date":      due_date.strftime("%Y-%m-%d"),
        "return_date":   None,
        "status":        "borrowed",
        "fine":          0.0,
        "penalty":       0.0,
        "total_charged": 0.0,
    }
    transactions = load_json(TRANSACTIONS_FILE)
    transactions.append(transaction)
    save_json(TRANSACTIONS_FILE, transactions)

    return jsonify({
        "success": True,
        "message": f'"{book["title"]}" borrowed successfully.',
        "data": {
            "borrow_date": borrow_date.strftime("%Y-%m-%d"),
            "due_date":    due_date.strftime("%Y-%m-%d"),
            "transaction": transaction,
        }
    }), 200


# ──────────────────────────────────────────────
#  Routes: Returns
# ──────────────────────────────────────────────

@app.route("/api/return", methods=["POST"])
def return_book():
    payload = request.get_json()
    if not payload:
        return jsonify({"success": False, "message": "No data provided."}), 400

    borrower_name = payload.get("borrower_name", "").strip()
    condition     = payload.get("condition", "good").strip().lower()
    book_title    = payload.get("book_title", "").strip()

    if not borrower_name:
        return jsonify({"success": False, "message": "borrower_name is required."}), 400
    if condition not in ("good", "damaged", "lost"):
        return jsonify({"success": False, "message": "condition must be good, damaged, or lost."}), 400

    books        = load_json(BOOKS_FILE)
    transactions = load_json(TRANSACTIONS_FILE)

    open_txns = [
        t for t in transactions
        if t["borrower_name"].lower() == borrower_name.lower()
        and t["status"] == "borrowed"
    ]

    if not open_txns:
        return jsonify({"success": False, "message": "No active borrowing found for this person."}), 404

    if len(open_txns) > 1 and not book_title:
        titles = [t["book_title"] for t in open_txns]
        return jsonify({
            "success": False,
            "message": "Multiple books found. Please specify book_title.",
            "borrowed_books": titles,
        }), 400

    if book_title:
        txn = next(
            (t for t in open_txns if t["book_title"].lower() == book_title.lower()),
            None
        )
        if not txn:
            return jsonify({"success": False, "message": "No matching open transaction found."}), 404
    else:
        txn = open_txns[0]

    book = find_book_by_id(txn["book_id"], books)
    if not book:
        return jsonify({"success": False, "message": "Associated book record not found."}), 500

    fine    = 0.0
    penalty = 0.0

    if condition == "good":
        fine    = calculate_fine(txn["due_date"])
        status  = "returned"
    elif condition == "damaged":
        fine    = calculate_fine(txn["due_date"])
        penalty = DAMAGE_PENALTY
        status  = "damaged"
    else:
        penalty = calculate_loss_penalty(book["price"])
        status  = "lost"

    total_charged = round(fine + penalty, 2)

    txn["return_date"]   = datetime.now().strftime("%Y-%m-%d")
    txn["status"]        = status
    txn["fine"]          = fine
    txn["penalty"]       = penalty
    txn["total_charged"] = total_charged
    save_json(TRANSACTIONS_FILE, transactions)

    book["is_available"] = True
    book["borrowed_by"]  = None
    book["due_date"]     = None
    save_json(BOOKS_FILE, books)

    return jsonify({
        "success": True,
        "message": f'"{book["title"]}" returned successfully.',
        "data": {
            "book_title":    book["title"],
            "borrower_name": borrower_name,
            "condition":     condition,
            "fine":          fine,
            "penalty":       penalty,
            "total_charged": total_charged,
            "status":        status,
        }
    }), 200


# ──────────────────────────────────────────────
#  Routes: Transactions & Reports
# ──────────────────────────────────────────────

@app.route("/api/transactions", methods=["GET"])
def get_transactions():
    status = request.args.get("status", "").lower()
    transactions = load_json(TRANSACTIONS_FILE)
    if status:
        transactions = [t for t in transactions if t["status"] == status]
    return jsonify({"success": True, "data": transactions}), 200


@app.route("/api/report", methods=["GET"])
def get_financial_report():
    transactions = load_json(TRANSACTIONS_FILE)
    books        = load_json(BOOKS_FILE)

    total_revenue   = sum(t["total_charged"] for t in transactions)
    total_fines     = sum(t["fine"] for t in transactions)
    total_penalties = sum(t["penalty"] for t in transactions)
    total_borrowed  = len([t for t in transactions if t["status"] == "borrowed"])
    total_returned  = len([t for t in transactions if t["status"] == "returned"])
    total_damaged   = len([t for t in transactions if t["status"] == "damaged"])
    total_lost      = len([t for t in transactions if t["status"] == "lost"])
    overdue_books   = []

    today = datetime.now().date()
    for t in transactions:
        if t["status"] == "borrowed" and t.get("due_date"):
            due = datetime.strptime(t["due_date"], "%Y-%m-%d").date()
            if today > due:
                days_overdue = (today - due).days
                overdue_books.append({
                    "book_title":    t["book_title"],
                    "borrower_name": t["borrower_name"],
                    "due_date":      t["due_date"],
                    "days_overdue":  days_overdue,
                    "accrued_fine":  round(days_overdue * FINE_PER_DAY, 2),
                })

    return jsonify({
        "success": True,
        "data": {
            "summary": {
                "total_books":        len(books),
                "available_books":    len([b for b in books if b["is_available"]]),
                "borrowed_books":     total_borrowed,
                "total_transactions": len(transactions),
                "total_returned":     total_returned,
                "total_damaged":      total_damaged,
                "total_lost":         total_lost,
            },
            "financials": {
                "total_revenue":   round(total_revenue, 2),
                "fines_collected": round(total_fines, 2),
                "penalties":       round(total_penalties, 2),
                "fine_rate":       f"₹{FINE_PER_DAY}/day",
                "damage_penalty":  f"₹{DAMAGE_PENALTY}",
            },
            "overdue_books": sorted(overdue_books, key=lambda x: x["days_overdue"], reverse=True),
        }
    }), 200


@app.route("/api/check-fine", methods=["GET"])
def check_fine():
    borrower_name = request.args.get("borrower_name", "").strip()
    if not borrower_name:
        return jsonify({"success": False, "message": "borrower_name is required."}), 400

    transactions = load_json(TRANSACTIONS_FILE)
    open_txns    = [
        t for t in transactions
        if t["borrower_name"].lower() == borrower_name.lower()
        and t["status"] == "borrowed"
    ]

    if not open_txns:
        return jsonify({"success": False, "message": "No active borrowing found."}), 404

    result = []
    for t in open_txns:
        fine = calculate_fine(t["due_date"])
        result.append({
            "book_title":  t["book_title"],
            "due_date":    t["due_date"],
            "fine_so_far": fine,
            "is_overdue":  fine > 0,
        })

    return jsonify({"success": True, "data": result}), 200


if __name__ == "__main__":
    app.run(debug=True, port=5000)
