use wasm_bindgen::prelude::*;
use cedar_policy::{Authorizer, Context, Request, PolicySet, Entities};
use serde_json::Value;

#[wasm_bindgen]
pub fn is_authorized(
    principal: &str,
    action: &str,
    resource: &str,
    context_json: &str,
    policy_text: &str,
) -> bool {
    let principal_entity = match principal.parse() {
        Ok(e) => e,
        Err(_) => return false,
    };
    let action_entity = match action.parse() {
        Ok(e) => e,
        Err(_) => return false,
    };
    let resource_entity = match resource.parse() {
        Ok(e) => e,
        Err(_) => return false,
    };

    let context_val: Value = match serde_json::from_str(context_json) {
        Ok(v) => v,
        Err(_) => Value::Null,
    };
    let context = match Context::from_jsonval(context_val, None) {
        Ok(c) => c,
        Err(_) => Context::empty(),
    };

    let request = Request::new(
        Some(principal_entity),
        Some(action_entity),
        Some(resource_entity),
        context,
        None,
    ).unwrap();

    let policies = match PolicySet::from_str(policy_text) {
        Ok(p) => p,
        Err(_) => return false,
    };

    let authorizer = Authorizer::new();
    let answer = authorizer.is_authorized(&request, &policies, &Entities::empty());

    if answer.diagnostics().errors().next().is_some() {
        return false;
    }
    answer.decision() == cedar_policy::Decision::Allow
}
