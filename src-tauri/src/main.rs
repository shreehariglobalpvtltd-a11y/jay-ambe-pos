#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use rusqlite::{params, Connection};
use serde_json::Value;
use std::fs;
use std::sync::Mutex;

struct AppDb(Mutex<Connection>);

fn get_db_path() -> std::path::PathBuf {
    let local = dirs::data_local_dir().unwrap_or_else(|| std::path::PathBuf::from("."));
    let dir = local.join("JayAmbePOS");
    fs::create_dir_all(&dir).ok();
    dir.join("pos.db")
}

fn get_backup_dir() -> std::path::PathBuf {
    let docs = dirs::document_dir().unwrap_or_else(|| std::path::PathBuf::from("."));
    let dir = docs.join("JayAmbeBackup");
    fs::create_dir_all(&dir).ok();
    dir
}

fn init_db(conn: &Connection) {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS orders (
            id TEXT PRIMARY KEY,
            order_num INTEGER,
            date TEXT,
            time TEXT,
            ts INTEGER,
            table_no TEXT,
            table_name TEXT,
            guests TEXT,
            waiter TEXT,
            customer_name TEXT,
            mobile TEXT,
            note TEXT,
            pay_method TEXT,
            status TEXT,
            total REAL,
            comm_total REAL,
            net_total REAL,
            cancel_reason TEXT,
            items_json TEXT
        );
        CREATE TABLE IF NOT EXISTS menu_items (
            id TEXT PRIMARY KEY,
            name TEXT,
            category TEXT,
            price REAL,
            comm_type TEXT,
            comm_val REAL,
            gst_slab INTEGER,
            is_nonveg INTEGER,
            is_active INTEGER
        );
        CREATE TABLE IF NOT EXISTS backup_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts INTEGER,
            filename TEXT,
            orders_count INTEGER,
            status TEXT
        );
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        );",
    )
    .expect("Failed to create tables");
}

#[tauri::command]
fn upsert_order(order_json: String, state: tauri::State<AppDb>) -> Result<String, String> {
    let v: Value = serde_json::from_str(&order_json).map_err(|e| e.to_string())?;
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    let id = v["id"].as_str().unwrap_or("");
    let order_num = v["num"].as_i64().unwrap_or(0);
    let date = v["date"].as_str().unwrap_or("");
    let time = v["time"].as_str().unwrap_or("");
    let ts = v["ts"].as_i64().unwrap_or(0);
    let table_no = v["train"].as_str().unwrap_or("");
    let table_name = v["trainName"].as_str().unwrap_or("");
    let guests = v["pnr"].as_str().unwrap_or("");
    let waiter = v["coach"].as_str().unwrap_or("");
    let customer_name = v["name"].as_str().unwrap_or("");
    let mobile = v["mobile"].as_str().unwrap_or("");
    let note = v["note"].as_str().unwrap_or("");
    let pay_method = v["pay"].as_str().unwrap_or("");
    let status = v["status"].as_str().unwrap_or("Pending");
    let total = v["total"].as_f64().unwrap_or(0.0);
    let comm_total = v["commTotal"].as_f64().unwrap_or(0.0);
    let net_total = v["netTotal"].as_f64().unwrap_or(0.0);
    let cancel_reason = v["cancelReason"].as_str().unwrap_or("");
    let items_json = serde_json::to_string(&v["items"]).unwrap_or_else(|_| "[]".to_string());

    conn.execute(
        "INSERT OR REPLACE INTO orders
         (id, order_num, date, time, ts, table_no, table_name, guests, waiter,
          customer_name, mobile, note, pay_method, status, total, comm_total,
          net_total, cancel_reason, items_json)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19)",
        params![
            id, order_num, date, time, ts, table_no, table_name, guests, waiter,
            customer_name, mobile, note, pay_method, status, total, comm_total,
            net_total, cancel_reason, items_json
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok("ok".to_string())
}

#[tauri::command]
fn get_orders(date_from: String, date_to: String, state: tauri::State<AppDb>) -> Result<String, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, order_num, date, time, ts, table_no, table_name, guests, waiter,
                    customer_name, mobile, note, pay_method, status, total, comm_total,
                    net_total, cancel_reason, items_json
             FROM orders WHERE date >= ?1 AND date <= ?2 ORDER BY ts DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![date_from, date_to], |row| {
            let items_str: String = row.get(18)?;
            let items: Value = serde_json::from_str(&items_str).unwrap_or(Value::Array(vec![]));
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "num": row.get::<_, i64>(1)?,
                "date": row.get::<_, String>(2)?,
                "time": row.get::<_, String>(3)?,
                "ts": row.get::<_, i64>(4)?,
                "train": row.get::<_, String>(5)?,
                "trainName": row.get::<_, String>(6)?,
                "pnr": row.get::<_, String>(7)?,
                "coach": row.get::<_, String>(8)?,
                "name": row.get::<_, String>(9)?,
                "mobile": row.get::<_, String>(10)?,
                "note": row.get::<_, String>(11)?,
                "pay": row.get::<_, String>(12)?,
                "status": row.get::<_, String>(13)?,
                "total": row.get::<_, f64>(14)?,
                "commTotal": row.get::<_, f64>(15)?,
                "netTotal": row.get::<_, f64>(16)?,
                "cancelReason": row.get::<_, String>(17)?,
                "items": items,
            }))
        })
        .map_err(|e| e.to_string())?;

    let mut results: Vec<Value> = Vec::new();
    for row in rows {
        if let Ok(val) = row {
            results.push(val);
        }
    }
    serde_json::to_string(&results).map_err(|e| e.to_string())
}

#[tauri::command]
fn sync_all(orders_json: String, menu_json: String, state: tauri::State<AppDb>) -> Result<String, String> {
    let orders: Vec<Value> = serde_json::from_str(&orders_json).map_err(|e| e.to_string())?;
    let menu: Vec<Value> = serde_json::from_str(&menu_json).map_err(|e| e.to_string())?;
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    for o in &orders {
        let id = o["id"].as_str().unwrap_or("");
        if id.is_empty() {
            continue;
        }
        let items_json = serde_json::to_string(&o["items"]).unwrap_or_else(|_| "[]".to_string());
        conn.execute(
            "INSERT OR REPLACE INTO orders
             (id, order_num, date, time, ts, table_no, table_name, guests, waiter,
              customer_name, mobile, note, pay_method, status, total, comm_total,
              net_total, cancel_reason, items_json)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19)",
            params![
                id,
                o["num"].as_i64().unwrap_or(0),
                o["date"].as_str().unwrap_or(""),
                o["time"].as_str().unwrap_or(""),
                o["ts"].as_i64().unwrap_or(0),
                o["train"].as_str().unwrap_or(""),
                o["trainName"].as_str().unwrap_or(""),
                o["pnr"].as_str().unwrap_or(""),
                o["coach"].as_str().unwrap_or(""),
                o["name"].as_str().unwrap_or(""),
                o["mobile"].as_str().unwrap_or(""),
                o["note"].as_str().unwrap_or(""),
                o["pay"].as_str().unwrap_or(""),
                o["status"].as_str().unwrap_or("Pending"),
                o["total"].as_f64().unwrap_or(0.0),
                o["commTotal"].as_f64().unwrap_or(0.0),
                o["netTotal"].as_f64().unwrap_or(0.0),
                o["cancelReason"].as_str().unwrap_or(""),
                items_json
            ],
        )
        .ok();
    }

    for m in &menu {
        let id = m["id"].as_str().unwrap_or("");
        if id.is_empty() {
            continue;
        }
        conn.execute(
            "INSERT OR REPLACE INTO menu_items
             (id, name, category, price, comm_type, comm_val, gst_slab, is_nonveg, is_active)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
            params![
                id,
                m["name"].as_str().unwrap_or(""),
                m["cat"].as_str().unwrap_or(""),
                m["price"].as_f64().unwrap_or(0.0),
                m["commType"].as_str().unwrap_or("pct"),
                m["commVal"].as_f64().unwrap_or(0.0),
                m["gst"].as_i64().unwrap_or(0),
                if m["nonveg"].as_bool().unwrap_or(false) { 1 } else { 0 },
                if m["active"].as_bool().unwrap_or(true) { 1 } else { 0 },
            ],
        )
        .ok();
    }

    let count = orders.len() + menu.len();
    Ok(format!("synced {} records", count))
}

#[tauri::command]
fn raw_print(printer: String, content: String) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        use std::io::Write;

        if printer.trim().is_empty() {
            return Err("No printer device selected".to_string());
        }

        // Use a unique temp file per call so concurrent/rapid clicks never
        // race on the same path (old code reused one fixed filename).
        let temp_dir = std::env::temp_dir();
        let unique = format!(
            "jayambe_print_{}.txt",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        );
        let temp_file = temp_dir.join(unique);
        fs::write(&temp_file, &content).map_err(|e| format!("temp file write failed: {}", e))?;

        // Primary method: raw byte copy straight to the printer share.
        // This is what actually works reliably for ESC/POS thermal printers
        // on Windows — far more reliable than the legacy PRINT.EXE utility,
        // which frequently fails silently on first invocation.
        let printer_path = format!(r"\\localhost\{}", printer);
        let copy_result = std::process::Command::new("cmd")
            .args(["/C", "copy", "/B"])
            .arg(temp_file.to_str().unwrap_or(""))
            .arg(&printer_path)
            .output();

        let copy_ok = match &copy_result {
            Ok(out) => out.status.success(),
            Err(_) => false,
        };

        if copy_ok {
            let _ = fs::remove_file(&temp_file);
            return Ok("printed".to_string());
        }

        // Fallback: legacy PRINT.EXE with correctly-formed /D:"printer" arg
        // (previously passed as two separate args, which Windows silently
        // ignored — that's why prints would "randomly" not happen).
        let print_arg = format!(r#"/D:"{}""#, printer);
        let output = std::process::Command::new("cmd")
            .args(["/C", "print"])
            .arg(&print_arg)
            .arg(temp_file.to_str().unwrap_or(""))
            .output();

        let printed = match &output {
            Ok(out) => out.status.success(),
            Err(_) => false,
        };

        if printed {
            let _ = fs::remove_file(&temp_file);
            return Ok("printed".to_string());
        }

        // Last resort: send via the Windows print spooler API through a
        // small PowerShell call (works even when PRINT.EXE / copy fail).
        let ps_script = format!(
            "Get-Content -Path '{}' -Raw | Out-Printer -Name '{}'",
            temp_file.to_str().unwrap_or("").replace('\'', "''"),
            printer.replace('\'', "''")
        );
        let ps_result = std::process::Command::new("powershell")
            .args(["-NoProfile", "-Command", &ps_script])
            .output();

        let _ = fs::remove_file(&temp_file);

        match ps_result {
            Ok(out) if out.status.success() => Ok("printed".to_string()),
            Ok(out) => {
                let err = String::from_utf8_lossy(&out.stderr).to_string();
                Err(format!("Print failed on '{}': {}", printer, err))
            }
            Err(e) => Err(format!("Print failed on '{}': {}", printer, e)),
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("Printing only supported on Windows".to_string())
    }
}

#[tauri::command]
fn list_printers() -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        let output = std::process::Command::new("wmic")
            .args(["printer", "get", "name"])
            .output()
            .map_err(|e| e.to_string())?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        let printers: Vec<String> = stdout
            .lines()
            .skip(1)
            .map(|l| l.trim().to_string())
            .filter(|l| !l.is_empty())
            .collect();

        serde_json::to_string(&printers).map_err(|e| e.to_string())
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok("[]".to_string())
    }
}

#[tauri::command]
fn save_backup(data: String, filename: String) -> Result<String, String> {
    let dir = get_backup_dir();
    let path = dir.join(&filename);
    fs::write(&path, &data).map_err(|e| e.to_string())?;

    // Keep only last 50 backup files
    let mut entries: Vec<_> = fs::read_dir(&dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.path()
                .extension()
                .map_or(false, |ext| ext == "json")
        })
        .collect();

    if entries.len() > 50 {
        entries.sort_by_key(|e| e.metadata().and_then(|m| m.modified()).unwrap_or(std::time::SystemTime::UNIX_EPOCH));
        for old in entries.iter().take(entries.len() - 50) {
            fs::remove_file(old.path()).ok();
        }
    }

    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn log_backup(ts: i64, filename: String, count: i32, status: String, state: tauri::State<AppDb>) -> Result<String, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO backup_log (ts, filename, orders_count, status) VALUES (?1, ?2, ?3, ?4)",
        params![ts, filename, count, status],
    )
    .map_err(|e| e.to_string())?;

    // Keep only last 100 log entries
    conn.execute(
        "DELETE FROM backup_log WHERE id NOT IN (SELECT id FROM backup_log ORDER BY id DESC LIMIT 100)",
        [],
    )
    .ok();

    Ok("logged".to_string())
}

#[tauri::command]
fn get_backup_log(state: tauri::State<AppDb>) -> Result<String, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, ts, filename, orders_count, status FROM backup_log ORDER BY id DESC LIMIT 20")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, i64>(0)?,
                "ts": row.get::<_, i64>(1)?,
                "filename": row.get::<_, String>(2)?,
                "count": row.get::<_, i32>(3)?,
                "status": row.get::<_, String>(4)?,
            }))
        })
        .map_err(|e| e.to_string())?;

    let mut results: Vec<Value> = Vec::new();
    for row in rows {
        if let Ok(val) = row {
            results.push(val);
        }
    }
    serde_json::to_string(&results).map_err(|e| e.to_string())
}

fn main() {
    let db_path = get_db_path();
    let conn = Connection::open(&db_path).expect("Failed to open SQLite database");
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;").ok();
    init_db(&conn);

    tauri::Builder::default()
        .manage(AppDb(Mutex::new(conn)))
        .invoke_handler(tauri::generate_handler![
            upsert_order,
            get_orders,
            sync_all,
            raw_print,
            list_printers,
            save_backup,
            log_backup,
            get_backup_log,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
