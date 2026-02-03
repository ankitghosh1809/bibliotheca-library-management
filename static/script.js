/**
 * Bibliotheca — Library Management System
 * Frontend controller: tab navigation, API calls, DOM rendering
 */

"use strict";

// ─────────────────────────────────────────────────
//  Utility helpers
// ─────────────────────────────────────────────────

/**
 * Show a toast notification.
 * @param {string} message
 * @param {'success'|'error'|'info'} type
 */
function showToast(message, type = "info") {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.className = `toast ${type}`;
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => { toast.className = "toast hidden"; }, 3500);
}

/**
 * Format a rupee amount.
 * @param {number} amount
 * @returns {string}
 */
function formatRupee(amount) {
    if (amount === 0 || amount == null) return "—";
    return `₹${parseFloat(amount).toFixed(2)}`;
}

/**
 * Generic API call wrapper.
 * @param {string} url
 * @param {object} [options]
 * @returns {Promise<object>}
 */
async function api(url, options = {}) {
    try {
        const res = await fetch(url, {
            headers: { "Content-Type": "application/json" },
            ...options,
        });
        return await res.json();
    } catch (err) {
        console.error("API error:", err);
        return { success: false, message: "Network error. Is the server running?" };
    }
}

// ─────────────────────────────────────────────────
//  Tab navigation
// ─────────────────────────────────────────────────

function initTabs() {
    const tabs   = document.querySelectorAll(".tab");
    const panels = document.querySelectorAll(".panel");

    tabs.forEach(tab => {
        tab.addEventListener("click", () => {
            const target = tab.dataset.target;

            tabs.forEach(t => t.classList.remove("active"));
            panels.forEach(p => p.classList.remove("active"));

            tab.classList.add("active");
            document.getElementById(target)?.classList.add("active");

            // Lazy-load data when switching tabs
            switch (target) {
                case "catalogue":     loadCatalogue(); break;
                case "borrow":        loadAvailableForBorrow(); break;
                case "transactions":  loadTransactions(); break;
                case "report":        loadReport(); break;
                case "manage":        loadManage(); break;
            }
        });
    });
}

// ─────────────────────────────────────────────────
//  Catalogue panel
// ─────────────────────────────────────────────────

let allBooks = [];

async function loadCatalogue() {
    const data = await api("/api/books");
    if (!data.success) { showToast(data.message, "error"); return; }
    allBooks = data.data;
    renderBooks(allBooks);
}

function renderBooks(books) {
    const grid   = document.getElementById("bookGrid");
    const filter = document.getElementById("availableOnly").checked;
    const query  = document.getElementById("catalogueSearch").value.toLowerCase();

    let filtered = books;
    if (filter) filtered = filtered.filter(b => b.is_available);
    if (query)  filtered = filtered.filter(b =>
        b.title.toLowerCase().includes(query)  ||
        b.author.toLowerCase().includes(query) ||
        b.genre.toLowerCase().includes(query)  ||
        b.book_id.toLowerCase().includes(query)
    );

    if (filtered.length === 0) {
        grid.innerHTML = `<p class="empty-msg" style="grid-column:1/-1">No books match your filter.</p>`;
        return;
    }

    grid.innerHTML = filtered.map(book => {
        const avail      = book.is_available;
        const statusTag  = avail
            ? `<span class="book-status status-available">Available</span>`
            : `<span class="book-status status-borrowed">Borrowed</span>`;
        const dueInfo    = !avail && book.due_date
            ? `<p class="book-due">Due: ${book.due_date}</p>` : "";
        const borrowedBy = !avail && book.borrowed_by
            ? `<p style="font-size:12px;color:var(--ink-soft);margin-top:4px">
                 By: ${book.borrowed_by.name}
               </p>` : "";

        return `
        <div class="book-card ${avail ? "" : "unavailable"}">
            ${statusTag}
            <span class="book-id">${book.book_id}</span>
            <h3 class="book-title">${book.title}</h3>
            <p  class="book-author">${book.author}</p>
            ${dueInfo}
            ${borrowedBy}
            <div class="book-meta">
                <span class="book-genre">${book.genre}</span>
                <span class="book-price">₹${book.price}</span>
            </div>
        </div>`;
    }).join("");
}

function initCatalogue() {
    document.getElementById("availableOnly").addEventListener("change", () => renderBooks(allBooks));
    document.getElementById("catalogueSearch").addEventListener("input",  () => renderBooks(allBooks));
    loadCatalogue();
}

// ─────────────────────────────────────────────────
//  Borrow panel
// ─────────────────────────────────────────────────

async function loadAvailableForBorrow() {
    const data = await api("/api/books/available");
    if (!data.success) return;

    const list = document.getElementById("quickAvailList");
    list.innerHTML = data.data.map(book =>
        `<span class="quick-chip" data-id="${book.book_id}" title="${book.author}">
            <strong>${book.book_id}</strong> — ${book.title}
         </span>`
    ).join("");

    // Clicking a chip pre-fills the Book ID field
    list.querySelectorAll(".quick-chip").forEach(chip => {
        chip.addEventListener("click", () => {
            document.getElementById("borrowBookId").value = chip.dataset.id;
        });
    });
}

async function borrowBook() {
    const bookId      = document.getElementById("borrowBookId").value.trim();
    const borrowerName = document.getElementById("borrowerName").value.trim();
    const borrowerId   = document.getElementById("borrowerId").value.trim();

    if (!bookId || !borrowerName || !borrowerId) {
        showToast("Please fill in all fields.", "error"); return;
    }

    const data = await api("/api/borrow", {
        method: "POST",
        body:   JSON.stringify({ book_id: bookId, borrower_name: borrowerName, borrower_id: borrowerId }),
    });

    if (data.success) {
        showToast(`${data.message} Due: ${data.data.due_date}`, "success");
        document.getElementById("borrowBookId").value  = "";
        document.getElementById("borrowerName").value  = "";
        document.getElementById("borrowerId").value    = "";
        loadAvailableForBorrow();
    } else {
        showToast(data.message, "error");
    }
}

function initBorrow() {
    document.getElementById("borrowBtn").addEventListener("click", borrowBook);
    loadAvailableForBorrow();
}

// ─────────────────────────────────────────────────
//  Return panel
// ─────────────────────────────────────────────────

async function checkFine() {
    const name    = document.getElementById("returnName").value.trim();
    const preview = document.getElementById("finePreview");

    if (!name) { showToast("Enter borrower name first.", "error"); return; }

    const data = await api(`/api/check-fine?borrower_name=${encodeURIComponent(name)}`);
    preview.classList.remove("hidden");

    if (!data.success) {
        preview.textContent = data.message;
        return;
    }

    // Show fine preview and populate book title field if multiple books
    if (data.data.length > 1) {
        document.getElementById("returnTitleField").style.display = "flex";
        const titles = data.data.map(d => d.book_title).join(", ");
        showToast(`Multiple books found: ${titles}`, "info");
    }

    preview.innerHTML = data.data.map(d => {
        const fine = d.fine_so_far > 0
            ? `<span style="color:var(--red)">₹${d.fine_so_far} overdue fine</span>`
            : `<span style="color:var(--green)">No fine — on time</span>`;
        return `<strong>${d.book_title}</strong> · Due ${d.due_date} · ${fine}`;
    }).join("<br>");
}

async function returnBook() {
    const name      = document.getElementById("returnName").value.trim();
    const condition = document.querySelector('input[name="condition"]:checked')?.value ?? "good";
    const title     = document.getElementById("returnBookTitle").value.trim();

    if (!name) { showToast("Enter borrower name.", "error"); return; }

    const payload = { borrower_name: name, condition };
    if (title) payload.book_title = title;

    const data = await api("/api/return", {
        method: "POST",
        body:   JSON.stringify(payload),
    });

    if (data.success) {
        const d   = data.data;
        let msg   = data.message;
        if (d.total_charged > 0) msg += ` Total charged: ₹${d.total_charged}`;
        showToast(msg, "success");
        document.getElementById("returnName").value      = "";
        document.getElementById("returnBookTitle").value = "";
        document.getElementById("finePreview").classList.add("hidden");
        document.getElementById("returnTitleField").style.display = "none";
        document.querySelector('input[name="condition"][value="good"]').checked = true;
    } else {
        if (data.borrowed_books) {
            document.getElementById("returnTitleField").style.display = "flex";
        }
        showToast(data.message, "error");
    }
}

function initReturn() {
    document.getElementById("checkFineBtn").addEventListener("click", checkFine);
    document.getElementById("returnBtn").addEventListener("click", returnBook);
}

// ─────────────────────────────────────────────────
//  Transactions panel
// ─────────────────────────────────────────────────

async function loadTransactions(status = "") {
    const url  = status ? `/api/transactions?status=${status}` : "/api/transactions";
    const data = await api(url);
    const body  = document.getElementById("txnBody");
    const empty = document.getElementById("txnEmpty");

    if (!data.success) { showToast(data.message, "error"); return; }

    const txns = data.data;
    if (txns.length === 0) {
        body.innerHTML = "";
        empty.classList.remove("hidden");
        return;
    }
    empty.classList.add("hidden");

    body.innerHTML = txns.map(t => `
        <tr>
            <td class="mono">${t.txn_id}</td>
            <td><strong>${t.book_title}</strong><br>
                <span style="font-size:11.5px;color:var(--ink-soft)">${t.book_id}</span></td>
            <td>${t.borrower_name}<br>
                <span style="font-size:11.5px;color:var(--ink-soft)">${t.borrower_id}</span></td>
            <td class="mono">${t.borrow_date}</td>
            <td class="mono">${t.due_date}</td>
            <td class="mono">${t.return_date || "—"}</td>
            <td><span class="tag tag-${t.status}">${t.status}</span></td>
            <td class="amount-col">${formatRupee(t.fine)}</td>
            <td class="amount-col">${formatRupee(t.penalty)}</td>
            <td class="amount-col" style="font-weight:600">${formatRupee(t.total_charged)}</td>
        </tr>
    `).join("");
}

function initTransactions() {
    const filters = document.querySelectorAll(".ftab");
    filters.forEach(btn => {
        btn.addEventListener("click", () => {
            filters.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            loadTransactions(btn.dataset.status);
        });
    });
    loadTransactions();
}

// ─────────────────────────────────────────────────
//  Report panel
// ─────────────────────────────────────────────────

async function loadReport() {
    const data = await api("/api/report");
    if (!data.success) { showToast(data.message, "error"); return; }

    const { summary, financials, overdue_books } = data.data;

    // Summary cards
    const cards = [
        { label: "Total Books",        value: summary.total_books,        sub: "in catalogue" },
        { label: "Available",          value: summary.available_books,    sub: "ready to borrow",   hi: true },
        { label: "Currently Borrowed", value: summary.borrowed_books,     sub: "active loans" },
        { label: "Total Transactions", value: summary.total_transactions, sub: "all time" },
        { label: "Returned",           value: summary.total_returned,     sub: "completed" },
        { label: "Damaged",            value: summary.total_damaged,      sub: "penalty applied" },
        { label: "Lost",               value: summary.total_lost,         sub: "replacement charged" },
        { label: "Revenue Collected",  value: `₹${financials.total_revenue}`, sub: `Fines: ₹${financials.fines_collected} · Penalties: ₹${financials.penalties}`, hi: true },
    ];

    document.getElementById("reportCards").innerHTML = cards.map(c => `
        <div class="report-card ${c.hi ? "highlight" : ""}">
            <p class="rc-label">${c.label}</p>
            <p class="rc-value">${c.value}</p>
            <p class="rc-sub">${c.sub}</p>
        </div>
    `).join("");

    // Overdue table
    const body  = document.getElementById("overdueBody");
    const empty = document.getElementById("overdueEmpty");

    if (overdue_books.length === 0) {
        body.innerHTML = "";
        empty.classList.remove("hidden");
        return;
    }
    empty.classList.add("hidden");
    body.innerHTML = overdue_books.map(o => `
        <tr>
            <td><strong>${o.book_title}</strong></td>
            <td>${o.borrower_name}</td>
            <td class="mono">${o.due_date}</td>
            <td style="color:var(--red);font-weight:600">${o.days_overdue} day${o.days_overdue !== 1 ? "s" : ""}</td>
            <td class="amount-col" style="color:var(--red)">₹${o.accrued_fine}</td>
        </tr>
    `).join("");
}

function initReport() {
    document.getElementById("refreshReport").addEventListener("click", loadReport);
    loadReport();
}

// ─────────────────────────────────────────────────
//  Manage panel
// ─────────────────────────────────────────────────

async function loadManage() {
    const data = await api("/api/books");
    if (!data.success) return;

    const body = document.getElementById("manageBody");
    body.innerHTML = data.data.map(book => `
        <tr>
            <td class="mono">${book.book_id}</td>
            <td><strong>${book.title}</strong></td>
            <td>${book.author}</td>
            <td>${book.genre}</td>
            <td class="amount-col">₹${book.price}</td>
            <td>
                <span class="tag ${book.is_available ? "tag-returned" : "tag-borrowed"}">
                    ${book.is_available ? "Available" : "Borrowed"}
                </span>
            </td>
            <td>
                ${book.is_available
                    ? `<button class="btn btn-danger" onclick="deleteBook('${book.book_id}')">Remove</button>`
                    : `<span style="font-size:12px;color:var(--ink-soft)">In use</span>`
                }
            </td>
        </tr>
    `).join("");
}

async function addBook() {
    const bookId = document.getElementById("newBookId").value.trim();
    const title  = document.getElementById("newTitle").value.trim();
    const author = document.getElementById("newAuthor").value.trim();
    const genre  = document.getElementById("newGenre").value.trim();
    const price  = document.getElementById("newPrice").value.trim();

    if (!bookId || !title || !author || !genre || !price) {
        showToast("Please fill in all fields.", "error"); return;
    }

    const data = await api("/api/books", {
        method: "POST",
        body:   JSON.stringify({ book_id: bookId, title, author, genre, price }),
    });

    if (data.success) {
        showToast(data.message, "success");
        ["newBookId", "newTitle", "newAuthor", "newGenre", "newPrice"]
            .forEach(id => { document.getElementById(id).value = ""; });
        loadManage();
    } else {
        showToast(data.message, "error");
    }
}

async function deleteBook(bookId) {
    if (!confirm(`Remove book ${bookId} from the catalogue?`)) return;

    const data = await api(`/api/books/${bookId}`, { method: "DELETE" });
    if (data.success) {
        showToast(data.message, "success");
        loadManage();
    } else {
        showToast(data.message, "error");
    }
}

function initManage() {
    document.getElementById("addBookBtn").addEventListener("click", addBook);
    loadManage();
}

// ─────────────────────────────────────────────────
//  Bootstrap
// ─────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
    initTabs();
    initCatalogue();
    initBorrow();
    initReturn();
    initTransactions();
    initReport();
    initManage();
});
