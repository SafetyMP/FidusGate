use std::fs;
use std::path::{Path, PathBuf};
use std::str::FromStr;
use std::io::Read;
use std::time::Instant;
use tiny_http::{Server, Response, Header, Method};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use cedar_policy::{Authorizer, Context, Entities, PolicySet, Request, Decision, EntityUid};

// ==========================================
// Data Structures for JSON Serialization
// ==========================================

#[derive(Deserialize, Debug)]
struct AuthorizeRequest {
    principal: String,
    action: String,
    resource: String,
    context: Option<Value>,
}

#[derive(Serialize, Debug)]
struct AuthorizeResponse {
    decision: String,
    diagnostics: Diagnostics,
}

#[derive(Serialize, Debug)]
struct Diagnostics {
    reason: Vec<String>,
    errors: Vec<String>,
}

#[derive(Serialize, Debug)]
struct HealthResponse {
    status: String,
    policy_file: Option<String>,
    loaded_policies_count: usize,
}

// ==========================================
// Helper Functions
// ==========================================

fn find_policy_file() -> Option<PathBuf> {
    let candidates = [
        "policy.cedar",
        "../policy.cedar",
        "../../policy.cedar",
        "../../../policy.cedar",
        "/app/policy.cedar",
    ];
    for candidate in &candidates {
        let path = Path::new(candidate);
        if path.exists() {
            return Some(path.to_path_buf());
        }
    }
    None
}

fn log_info(message: &str) {
    let timestamp = chrono::Utc::now().to_rfc3339();
    println!("[{}] [INFO] {}", timestamp, message);
}

fn log_error(message: &str) {
    let timestamp = chrono::Utc::now().to_rfc3339();
    eprintln!("[{}] [ERROR] {}", timestamp, message);
}

// ==========================================
// Core Authorization Evaluator
// ==========================================

fn handle_authorize(
    req_body: &str,
    authorizer: &Authorizer,
) -> Result<AuthorizeResponse, String> {
    // 1. Parse incoming JSON request
    let auth_req: AuthorizeRequest = serde_json::from_str(req_body)
        .map_err(|e| format!("Failed to parse request body as JSON: {}", e))?;

    // 2. Find and load policy.cedar
    let policy_path = find_policy_file()
        .ok_or_else(|| "Could not locate policy.cedar file in candidates paths.".to_string())?;
    
    let policy_src = fs::read_to_string(&policy_path)
        .map_err(|e| format!("Failed to read policy file: {}", e))?;

    let policies = PolicySet::from_str(&policy_src)
        .map_err(|e| format!("Failed to parse Cedar policies: {}", e))?;

    // 3. Map principal, action, and resource into Cedar UIDs
    let principal_uid = EntityUid::from_str(&format!("User::\"{}\"", auth_req.principal))
        .map_err(|e| format!("Invalid principal format: {}", e))?;

    let action_uid = EntityUid::from_str("Action::\"call_tool\"")
        .map_err(|e| format!("Invalid action format: {}", e))?;

    let resource_uid = EntityUid::from_str(&format!("Tool::\"{}\"", auth_req.action))
        .map_err(|e| format!("Invalid resource format: {}", e))?;

    // 4. Extract context variables (path, commandLine)
    let context_val = auth_req.context.unwrap_or(Value::Null);
    let path = context_val.get("path")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let command_line = context_val.get("commandLine")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    // 5. Build secure in-memory Cedar Entity Store with attributes
    let entities_value = serde_json::json!([
        {
            "uid": { "type": "Tool", "id": auth_req.action },
            "attrs": {
                "tool_name": auth_req.action,
                "args": {
                    "path": path,
                    "commandLine": command_line
                }
            },
            "parents": []
        }
    ]);
    
    let entities_str = serde_json::to_string(&entities_value).unwrap();
    let entities = Entities::from_json_str(&entities_str, None)
        .map_err(|e| format!("Failed to compile in-memory entity store: {}", e))?;

    // 6. Build the Cedar Request
    let request = Request::new(
        Some(principal_uid),
        Some(action_uid),
        Some(resource_uid),
        Context::empty(),
        None,
    ).map_err(|e| format!("Failed to create Cedar request: {}", e))?;

    // 7. Evaluate policies
    let start_time = Instant::now();
    let response = authorizer.is_authorized(&request, &policies, &entities);
    let duration = start_time.elapsed();

    log_info(&format!(
        "Evaluation completed in {:?} | Request: User::\"{}\" Action::\"call_tool\" Tool::\"{}\" | Decision: {:?}",
        duration, auth_req.principal, auth_req.action, response.decision()
    ));

    // 8. Extract diagnostics and return
    let decision = match response.decision() {
        Decision::Allow => "allow".to_string(),
        Decision::Deny => "deny".to_string(),
    };

    let reason = response.diagnostics()
        .reason()
        .map(|r| r.to_string())
        .collect();

    let errors = response.diagnostics()
        .errors()
        .map(|e| e.to_string())
        .collect();

    Ok(AuthorizeResponse {
        decision,
        diagnostics: Diagnostics { reason, errors },
    })
}

// ==========================================
// Entrypoint Server
// ==========================================

fn main() {
    let port = 50051;
    let addr = format!("127.0.0.1:{}", port);
    
    let server = match Server::http(&addr) {
        Ok(s) => s,
        Err(e) => {
            log_error(&format!("Failed to bind server on {}: {}", addr, e));
            std::process::exit(1);
        }
    };

    log_info(&format!("VeritasAudit Rust Cedar Policy Daemon successfully listening on http://{}", addr));
    log_info("Awaiting authorization payloads...");

    let authorizer = Authorizer::new();
    let json_header = Header::from_str("Content-Type: application/json").unwrap();

    for mut request in server.incoming_requests() {
        let path = request.url().to_string();
        let method = request.method().clone();

        match (&method, path.as_str()) {
            (&Method::Get, "/health") => {
                let policy_file = find_policy_file();
                let policy_file_str = policy_file.as_ref().map(|p| p.to_string_lossy().to_string());
                
                let loaded_policies_count = if let Some(p) = &policy_file {
                    fs::read_to_string(p)
                        .ok()
                        .and_then(|src| PolicySet::from_str(&src).ok())
                        .map(|set| set.policies().count())
                        .unwrap_or(0)
                } else {
                    0
                };

                let health = HealthResponse {
                    status: "healthy".to_string(),
                    policy_file: policy_file_str,
                    loaded_policies_count,
                };

                let json = serde_json::to_string(&health).unwrap();
                let response = Response::from_string(json)
                    .with_status_code(200)
                    .with_header(json_header.clone());
                let _ = request.respond(response);
            }
            (&Method::Post, "/authorize") => {
                let mut body = String::new();
                if let Err(e) = request.as_reader().read_to_string(&mut body) {
                    log_error(&format!("Failed to read request stream body: {}", e));
                    let response = Response::from_string(r#"{"error":"Failed to read request body"}"#)
                        .with_status_code(400)
                        .with_header(json_header.clone());
                    let _ = request.respond(response);
                    continue;
                }

                match handle_authorize(&body, &authorizer) {
                    Ok(auth_res) => {
                        let json = serde_json::to_string(&auth_res).unwrap();
                        let response = Response::from_string(json)
                            .with_status_code(200)
                            .with_header(json_header.clone());
                        let _ = request.respond(response);
                    }
                    Err(err_msg) => {
                        log_error(&format!("Authorization handler error: {}", err_msg));
                        let error_json = serde_json::json!({ "error": err_msg });
                        let response = Response::from_string(error_json.to_string())
                            .with_status_code(500)
                            .with_header(json_header.clone());
                        let _ = request.respond(response);
                    }
                }
            }
            _ => {
                let response = Response::from_string(r#"{"error":"Not Found"}"#)
                    .with_status_code(404)
                    .with_header(json_header.clone());
                let _ = request.respond(response);
            }
        }
    }
}
