# The Editorial Gate is a per-Category quota plus a deterministic score

Every Category contributes one to three Items, chosen by score, rather than the Issue being built from a single global ranking. The score weighs, in order: presence in the CISA KEV catalog, advisory severity, the Source's Tier, community velocity, and novelty relative to what has already been Seen. A Category with no qualifying Item is printed as empty rather than filled.

A global ranking would let a busy news day crowd out security entirely, and no Category would be reliably present — which is the whole promise of a fixed-section Issue. An empty Category is also a fact worth publishing: it tells the reader the day was genuinely quiet rather than that we padded.

## Consequences

The Issue's shape is stable and testable. A security Item without a Primary Record is dropped, not downgraded — the rule lives in code, not in a prompt.

**Amendment.** "A security Item without a Primary Record" was too broad, and measuring showed it: one Run dropped twenty Items under this rule, every one of them a DevSecOps practice article — how to do supply-chain security, how to threat-model — none of which asserts anything about a specific vulnerability and none of which could cite a CVE. The rule now binds the Items it was written for: anything from an advisory Source, and anything from anywhere that names a CVE. A practice article about threat modelling is admitted; a practice article that mentions CVE-2026-1234 is still dropped unless it can cite a Primary Record. The safety property is unchanged — no reader is told a vulnerability is patched when it is not — while the Category can now carry guidance as well as advisories.