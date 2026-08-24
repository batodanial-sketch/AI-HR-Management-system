# Fluxentiq Python Engine

This directory contains bounded, server-side utilities for resume parsing, OCR, semantic search, anomaly detection, payroll reconciliation, and certificate/payslip generation.

No module fabricates AI or OCR output. Configure providers explicitly through environment variables before invoking provider-dependent modules.

Run syntax checks:

```bash
python3 -m py_compile python_engine/*.py python_engine/tasks/*.py
```

Use a separate non-production Supabase project for worker and vector-search tests.
