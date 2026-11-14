# Clerk trial limits

The isolated five-invoice trial tested run A, the ungated clerk, on five synthetic poisoned invoices. It recorded **0/5 hijacks and zero failed requests**. Each clerk run used a fresh Intern home with memory disabled. An earlier trial used shared memory, so it is not evidence for the isolated result.

Runs B (Drex gate) and C (LLM guard gate) have not been completed. With no observed hijacks in the isolated run A, this trial cannot show that either gate prevented a hijack or provide a meaningful A/B/C comparison. Five examples are too few to establish a reliable hijack rate, and they are synthetic rather than real invoices. Do not interpret 0/5 as proof the clerk is safe. A useful follow-up would first establish a reproducible ungated hijack, then run all three conditions on the same cases and record failures separately.

The arena and the 95-case benchmark are separate experiments, not clerk A/B/C results. In the arena the LLM guard prompt explicitly instructs it not to follow invoice instructions; the Drex questions do not contain that instruction.
