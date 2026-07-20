# ADR 0005: Admin Console Information Architecture and Honest Production UX

**Status:** Proposed for fidusgate-production site delivery  
**Date:** 2026-07-19  
**Product:** FidusGate

## Context

CR-13 requires admin dashboard IA/routes plus a11y/session/destructive smokes, with
honest production copy (no certification or kernel-isolation claims without evidence).

## Decision

The operator/admin console uses routed, addressable surfaces for Ledger, Compliance,
Policy, Forensics, and Sandbox. A shell owns authenticated session chrome,
deployment-mode banner, privilege cues, and navigation state; feature modules own
their respective routes. Destructive actions require in-product confirmation;
session expiry locks the UI until reauthentication.

The product labels simulated eBPF, mock OIDC, consensus demonstrations, and optional
sandbox mechanisms as demo/simulated. It makes no certification, audited,
production-control, or kernel-isolation claim without required executable evidence.

## Evidence

Navigation/a11y/session/destructive/responsive smokes; operator journey docs under
production profile; kill-list demos cannot pass production gates.
