/**
 * A modern Semaphore implementation for Foundry V13.
 * Replaces the old await-semaphore adaptation with ES2022+ standards.
 */
export class Semaphore {
    // Private fields ensure internal state cannot be corrupted by external scripts
    #tasks = [];
    #count;

    constructor(count) {
        this.#count = count;
    }

    /**
     * Internal scheduler to process the next task in the queue.
     */
    #sched() {
        if (this.#count > 0 && this.#tasks.length > 0) {
            this.#count--;
            const next = this.#tasks.shift();
            if (!next) {
                throw new Error("Semaphore: Unexpected undefined value in tasks list.");
            }
            next();
        }
    }

    /**
     * Acquires a lock.
     * @returns {Promise<Function>} A promise that resolves to a release function.
     */
    acquire() {
        return new Promise((resolve) => {
            const task = () => {
                let released = false;
                
                // Resolve the promise with the 'release' function
                resolve(() => {
                    if (!released) {
                        released = true;
                        this.#count++;
                        this.#sched();
                    }
                });
            };

            this.#tasks.push(task);
            
            // Schedule the check for the next tick to ensure async behavior
            setTimeout(() => this.#sched(), 0);
        });
    }

    /**
     * Executes a function within the lock, automatically releasing it afterwards.
     * Updated to use async/await and try/finally for safer error handling.
     * @param {Function} fn - The function to execute.
     * @returns {Promise<any>} The result of the function.
     */
    async use(fn) {
        const release = await this.acquire();
        try {
            return await fn();
        } finally {
            // Always release the lock, even if the function errors
            release();
        }
    }
}

/**
 * A Mutex is simply a Semaphore with a capacity of 1.
 */
export class Mutex extends Semaphore {
    constructor() {
        super(1);
    }
}
