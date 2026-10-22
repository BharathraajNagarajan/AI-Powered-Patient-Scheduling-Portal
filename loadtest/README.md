# Load test

`k6.js` ramps to 500 virtual users over 5 minutes, then ramps down over 30 seconds. Each virtual user repeats one flow: create a session, run the initial chat, select a slot, book it. The target is a separate app instance running with `MOCK_LLM=true`, so no OpenAI calls are made and nothing is billed.

Pass criteria:

- `http_req_failed` below 1 percent. Responses with status 409 (slot conflict) are expected and not counted as failures.
- `http_req_duration` p95 below 800 ms.

Latency and error rate are also reported per endpoint using the k6 tag `endpoint` (`session`, `chat`, `select`, `book`). The end-of-run summary prints peak VUs, total requests, bookings succeeded, 409 conflicts, and a per-endpoint table of p50, p95, p99, and error rate. The full k6 summary is written to `loadtest/results/summary.json`.

The demo calendar holds about 500 slots (4 providers, weekdays, 60 days), so a long run exhausts it and later iterations take the no-slot path or hit 409. To keep the booking path busy for longer, seed more days with `SLOT_HORIZON_DAYS` (for example 365).

## Requirements

Install k6 on Windows with `winget install k6 --source winget` (or `choco install k6`). On Linux see https://grafana.com/docs/k6/latest/set-up/install-k6/.

## Sequence

All commands run from the repository root and work in Windows PowerShell and Linux shells.

1. Build once:

```
npm run build
```

2. Terminal A: start the mock instance on 127.0.0.1:3100 with a fresh database. The script deletes `data-loadtest/` before starting.

```
npm run loadtest:server
```

To seed a longer calendar, set `SLOT_HORIZON_DAYS` first. PowerShell: `$env:SLOT_HORIZON_DAYS=365; npm run loadtest:server`. Linux: `SLOT_HORIZON_DAYS=365 npm run loadtest:server`.

3. Terminal B: run the full test.

```
k6 run loadtest/k6.js
```

For a 60 second, 50 VU smoke run:

```
k6 run -e PEAK_VUS=50 -e RAMP=10s -e HOLD=50s -e RAMP_DOWN=0s loadtest/k6.js
```

4. Stop the server in terminal A (Ctrl+C), then check the database it used:

```
npm run verify:integrity
```

Set `DATA_DIR` to the same directory the server used. PowerShell: `$env:DATA_DIR="./data-loadtest"; npm run verify:integrity`. Linux: `DATA_DIR=./data-loadtest npm run verify:integrity`. The command exits with code 1 if any check fails.

5. Copy the numbers from the k6 summary and the integrity output into the results table below.

## Notes

- Each iteration sends a different `X-Forwarded-For` value, so the per-IP rate limits do not cap a single load generator. This works only because the instance on 127.0.0.1:3100 is reached directly. Behind Nginx the header is overwritten with the real client address and the limits apply.
- To test the production server on its own host, run the mock instance on port 3100 next to the real one on port 3000 and point `BASE_URL` at it: `k6 run -e BASE_URL=http://127.0.0.1:3100 loadtest/k6.js`. The production instance listens on 127.0.0.1 only, so run k6 on the server.
- `HOST`, `PORT`, `DATA_DIR`, and `KEEP_DATA=1` (keep the existing database) are honored by `npm run loadtest:server`.

## Results

Run on an AWS EC2 t3.small (2 vCPU, 2 GB RAM, 2 GB swap), Ubuntu 24.04, Node 22. k6 ran on the same host against a mock instance on 127.0.0.1:3100 while the production PM2 cluster (2 workers) was running. Full ramp to 500 virtual users.

| Date | Instance | Peak VUs | Total requests | Bookings succeeded | 409 conflicts | Error rate | Integrity check |
|------|----------|----------|----------------|--------------------|---------------|------------|-----------------|
| 2026-10-22 | t3.small | 500 | 33840 | 504 | 0 | 0.00% | OK (6 of 6 checks passed) |

Latency per endpoint (milliseconds):

| Run date | Endpoint | Requests | p50 | p95 | p99 | Error rate |
|----------|----------|----------|-----|-----|-----|------------|
| 2026-10-22 | all | 33840 | 3.4 | 18.8 | 51.2 | 0.00% |
| 2026-10-22 | session | 16416 | 3.0 | 23.5 | 69.8 | 0.00% |
| 2026-10-22 | chat | 16416 | 3.6 | 15.2 | 40.0 | 0.00% |
| 2026-10-22 | select | 504 | 3.7 | 10.6 | 20.2 | 0.00% |
| 2026-10-22 | book | 504 | 3.9 | 10.4 | 21.0 | 0.00% |

Server resources during the run, sampled every 4 seconds:

| Metric | Peak |
|--------|------|
| Total CPU utilization (both vCPUs) | 55.5% |
| Memory in use (whole host) | 988 MB of 1905 MB |
| Combined node process RSS (2 production workers, mock instance, PM2 daemon) | 617 MB |

Both thresholds passed (http_req_failed below 1 percent, http_req_duration p95 below 800 ms). The demo calendar holds 504 slots, all of which were booked, so the 15912 iterations after that took the no-slot path and the book endpoint ran 504 times. The 33840 requests include those iterations.
