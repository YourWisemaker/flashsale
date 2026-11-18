# Mission

Arief Shop sells one limited-edition product in a timed flash sale: fixed stock, one unit per account, a configurable start and end. It has to survive thousands of people pressing Buy Now in the same second without overselling, double-selling, or falling over.

## Who it's for

- **Buyers**: a fair shot. First come, first served, one each, and a clear answer (pending, confirmed, already bought, sold out, not open yet).
- **Operators**: one CLI to seed, inspect, clean up and reconcile, and a system that degrades with a 503 instead of hanging.
- **Reviewers**: a design they can read in an afternoon, with tests that prove the claims.

## What "done" means here

- No overselling under any race (stress invariants, property tests, mutation 100% on core).
- The purchase path touches Redis only and answers in milliseconds.
- Every failure mode has a status code and a test.
