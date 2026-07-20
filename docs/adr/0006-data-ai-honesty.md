# ADR 0006: Data and AI Control Claims, Classification, and Retention

**Status:** Proposed for fidusgate-production site delivery  
**Date:** 2026-07-19  
**Product:** FidusGate

## Context

CR-14 requires hermetic evidence before tool-result/memory/retention claims.

## Decision

FidusGate retains the hermetic AI firewall, interview sanitization, and model-router
budget controls, but describes them according to their tested control class. The
model router is not an authorization substitute. Production claims about tool-result
poisoning, memory poisoning, classification, PII treatment, retention, or purge are
prohibited until each has dedicated hermetic fixtures and tests.

Data handling exposes a documented classification schema, extended masking rules,
retention class, authenticated purge/TTL operations, and audit events for lifecycle
actions.

## Evidence

Hermetic fixtures for malicious tool results and memory content; classification and
masking tests; authenticated purge/TTL tests; documentation that distinguishes
implemented controls from residual risks.
