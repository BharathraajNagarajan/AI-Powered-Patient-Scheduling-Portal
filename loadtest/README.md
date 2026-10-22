# Load test

The script in `k6.js` ramps from 0 to 500 virtual users over 5 minutes, then ramps down over 30 seconds. Each virtual user repeats one flow: create a session, run the initial chat, select a slot, book it. It is meant for a server running with `MOCK_LLM=true`, so no OpenAI calls are made and nothing is billed.

Thresholds:

- `http_req_failed` below 1 percent. Responses with status 409 (slot conflict) count as expected, not as failures.
- `http_req_duration` p95 below 800 ms.

Custom counters report `bookings_confirmed`, `booking_conflicts`, and `no_slots_available`. The demo data holds a fixed number of slots (4 providers, weekdays, 60 days), so a long run exhausts them and later iterations take the no-slot path. Delete the `data/` directory between runs to start from a full calendar.

## Requirements

Install k6 from https://grafana.com/docs/k6/latest/set-up/install-k6/.

## Run locally

```
npm run build
MOCK_LLM=true DATA_DIR=./data-loadtest npm start
```

In a second terminal:

```
k6 run loadtest/k6.js
```

Use `BASE_URL` to point at a different port:

```
k6 run -e BASE_URL=http://127.0.0.1:3100 loadtest/k6.js
```

## Run against the server

1. On the server, set `MOCK_LLM=true` in `.env` and reload with `pm2 reload ecosystem.config.js --env production --update-env`.
2. Run k6 on the server itself against the loopback address, so the test does not depend on the network path or on the Nginx per-IP limit:

```
k6 run -e BASE_URL=http://127.0.0.1:3000 loadtest/k6.js
```

3. Set `MOCK_LLM=false` again and reload when the test is done.

Each iteration sends a different `X-Forwarded-For` value so the application rate limits do not cap a single load generator. This only works when the app is reached directly. Behind Nginx the header is overwritten with the real client address, and the per-IP limits in `deploy/nginx.conf` and `lib/rate-limit.ts` will apply to the load generator.

## Results

| Date | Target | Instances | Peak VUs | http_req_failed | p95 latency | Bookings confirmed | Notes |
|------|--------|-----------|----------|-----------------|-------------|--------------------|-------|
|      |        |           |          |                 |             |                    |       |
