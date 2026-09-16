# The Editorial Gate is a per-Category quota plus a deterministic score

Every Category contributes one to three Items, chosen by score, rather than the Issue being built from a single global ranking. The score weighs, in order: presence in the CISA KEV catalog, advisory severity, the Source's Tier, community velocity, and novelty relative to what has already been Seen. A Category with no qualifying Item is printed as empty rather than filled.

A global ranking would let a busy news day crowd out security entirely, and no Category would be reliably present — which is the whole promise of a fixed-section Issue. An empty Category is also a fact worth publishing: it tells the reader the day was genuinely quiet rather than that we padded.

## Consequences

The Issue's shape is stable and testable. A security Item without a Primary Record is dropped, not downgraded — the rule lives in code, not in a prompt.