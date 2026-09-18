# An Issue targets a ten-to-twenty-minute read, enforced by measurement

The Issue's read length was originally a single number — ten minutes — written into the writer's instructions. Two things made that a fiction. The instruction was expressed in "Thai words", which is not a quantity anyone can check, because Thai does not separate words with spaces; and the writer holds an implicit total length of its own that neither a per-Item ceiling nor a Category quota reliably moves.

Measured with identical input, three Runs of the same prompt produced 6,306, 7,050 and 7,960 Thai characters — a swing of twenty-six percent, all of it below the intended reading time. Raising the per-Item ceiling moved the average Item from 407 to 517 characters; raising the quota from four to five moved it back to 371. The levers available in a prompt are weaker than the noise around them.

So the promise is now a band, ten to twenty minutes, and it is held in code: the Run measures the Issue it has written in Thai characters, and if the total falls short it makes a bounded second pass that deepens the shortest and most consequential Items from the same Facts. Three Runs with that pass produced 9,837, 10,473 and 11,754 characters, all inside the band, where none of the Runs without it were.

## Consequences

The reading-speed constant behind the conversion is no longer an assumption. The operator read an Issue of 11,754 Thai characters, Thai only, in 17.33 minutes — 678 characters per minute. The first version of the constant guessed 900, which made every duration the system reported about a third too short and made the Issue look like it was failing its target when it had already passed it. Re-measuring this number is the first step if the bands ever need revisiting.

The measured length is reported on every Run, so drift is visible rather than assumed. A Run that needs two deepening passes, or that still lands short after them, is a signal that something about the day's material or the prompt has changed.

A deepening pass may only add prose. An Item whose deepened Analysis fails to parse keeps the Analysis it already had, because losing a true sentence is worse than keeping a short one.