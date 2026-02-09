import { StateMachine } from "../src/index";
import { AbortTransition, InvalidTransition } from "../src/errors";

// Helper to create a fresh processor entity
const createProcessor = (overrides = {}) => ({
  id: 1,
  name: "P1",
  status: "idle",
  paid: true,
  ...overrides,
});

// ### 1. **PreTransition Validation**
describe("PreTransition Validation", () => {
  test("1.1 - throws error when transitioning to an invalid state", async () => {
    const onInvalidTransition = jest.fn();
    const machine = new StateMachine({
      initialState: "idle",
      transitions: {
        idle: { running: {} },
        running: { stopped: {} },
      },
      globalHooks: { onInvalidTransition },
    });

    const processor = createProcessor();
    await machine.transition(processor, "nonexistent");

    expect(onInvalidTransition).toHaveBeenCalled();
    expect(processor.status).toBe("idle");
  });

  test("1.2 - does not throw error when transitioning to valid state", async () => {
    const onError = jest.fn();
    const machine = new StateMachine({
      initialState: "idle",
      transitions: { idle: { running: {} } },
      globalHooks: { onError },
    });

    const processor = createProcessor();
    await machine.transition(processor, "running");

    expect(onError).not.toHaveBeenCalled();
    expect(processor.status).toBe("running");
  });

  test("1.3 - preTransition works correctly with allowedNextStates", async () => {
    const onBefore = jest.fn();
    const machine = new StateMachine({
      initialState: "idle",
      transitions: {
        idle: { running: { onBefore }, stopped: {} },
      },
    });

    const processor = createProcessor();
    await machine.transition(processor, "running");

    expect(onBefore).toHaveBeenCalledWith(processor);
    expect(processor.status).toBe("running");
  });
});

// ### 2. **Abort Propagation**
describe("Abort Propagation", () => {
  test("2.1 - preTransition aborts transition when AbortTransition is thrown", async () => {
    const onAbort = jest.fn();
    const machine = new StateMachine({
      initialState: "idle",
      transitions: {
        idle: {
          running: {
            isAbortable: true,
            onBefore: async () => {
              throw new AbortTransition({ message: "Aborting for test" });
            },
            onAbort,
          },
        },
      },
    });

    const processor = createProcessor();
    await machine.transition(processor, "running");

    expect(onAbort).toHaveBeenCalled();
  });

  test("2.2 - onAbort is called with correct payload", async () => {
    const onAbort = jest.fn();
    const machine = new StateMachine({
      initialState: "idle",
      transitions: {
        idle: {
          running: {
            isAbortable: true,
            onBefore: async () => {
              throw new AbortTransition({ message: "Payment not received" });
            },
            onAbort,
          },
        },
      },
    });

    const processor = createProcessor({ paid: false });
    await machine.transition(processor, "running", {
      actor: "User123",
      meta: { reason: "test" },
    });

    expect(onAbort).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "idle",
        to: "running",
        message: "Payment not received",
      }),
    );
  });

  test("2.3 - no state change occurs when transition is aborted", async () => {
    const machine = new StateMachine({
      initialState: "idle",
      transitions: {
        idle: {
          running: {
            isAbortable: true,
            onBefore: async () => {
              throw new AbortTransition({ message: "Aborting" });
            },
            onAbort: jest.fn(),
          },
        },
      },
    });

    const processor = createProcessor();
    await machine.transition(processor, "running");

    expect(processor.status).toBe("idle");
  });

  test("2.4 - onAfter is not triggered when transition is aborted", async () => {
    const onAfter = jest.fn();
    const machine = new StateMachine({
      initialState: "idle",
      transitions: {
        idle: {
          running: {
            isAbortable: true,
            onBefore: async () => {
              throw new AbortTransition({ message: "Aborting" });
            },
            onAbort: jest.fn(),
            onAfter,
          },
        },
      },
    });

    const processor = createProcessor();
    await machine.transition(processor, "running");

    expect(onAfter).not.toHaveBeenCalled();
  });
});

// ### 3. **PostTransition Consistency**
describe("PostTransition Consistency", () => {
  test("3.1 - postTransition is called after successful state change", async () => {
    const onAfter = jest.fn();
    const machine = new StateMachine({
      initialState: "idle",
      transitions: { idle: { running: { onAfter } } },
    });

    const processor = createProcessor();
    await machine.transition(processor, "running");

    expect(onAfter).toHaveBeenCalledWith(processor);
    expect(processor.status).toBe("running");
  });

  test("3.2 - postTransition not triggered on invalid transition", async () => {
    const onAfter = jest.fn();
    const machine = new StateMachine({
      initialState: "idle",
      transitions: { idle: { running: { onAfter } } },
    });

    const processor = createProcessor();
    await machine.transition(processor, "invalid_state");

    expect(onAfter).not.toHaveBeenCalled();
  });

  test("3.3 - postTransition correctly updates state based on nextState", async () => {
    const afterTransition = jest.fn();
    const machine = new StateMachine({
      initialState: "idle",
      transitions: {
        idle: { running: {} },
        running: { completed: {} },
      },
      globalHooks: { afterTransition: [afterTransition] },
    });

    const processor = createProcessor();
    await machine.transition(processor, "running");

    expect(afterTransition).toHaveBeenCalledWith(
      expect.objectContaining({ from: "idle", to: "running" }),
    );
    expect(processor.status).toBe("running");
  });

  test("3.4 - postTransition is skipped when transition fails", async () => {
    const onAfter = jest.fn();
    const afterTransition = jest.fn();
    const machine = new StateMachine({
      initialState: "idle",
      transitions: {
        idle: {
          running: {
            isAbortable: true,
            onBefore: async () => {
              throw new AbortTransition({ message: "Failed" });
            },
            onAbort: jest.fn(),
            onAfter,
          },
        },
      },
      globalHooks: { afterTransition: [afterTransition] },
    });

    const processor = createProcessor();
    await machine.transition(processor, "running");

    expect(onAfter).not.toHaveBeenCalled();
    expect(afterTransition).not.toHaveBeenCalled();
  });
});

// ### 4. **State Update Consistency**
describe("State Update Consistency", () => {
  test("4.1 - entity state is correctly updated during successful transition", async () => {
    const machine = new StateMachine({
      initialState: "idle",
      transitions: { idle: { running: {} } },
    });

    const processor = createProcessor();
    expect(processor.status).toBe("idle");

    await machine.transition(processor, "running");
    expect(processor.status).toBe("running");
  });

  test("4.2 - state does not change on error during transition", async () => {
    const machine = new StateMachine({
      initialState: "idle",
      transitions: {
        idle: {
          running: {
            isAbortable: true,
            onBefore: async () => {
              throw new AbortTransition({ message: "Error occurred" });
            },
            onAbort: jest.fn(),
          },
        },
      },
    });

    const processor = createProcessor();
    await machine.transition(processor, "running");

    expect(processor.status).toBe("idle");
  });

  test("4.3 - state change is atomic (no partial updates)", async () => {
    const machine = new StateMachine({
      initialState: "idle",
      transitions: { idle: { running: {} } },
    });

    const processor = createProcessor();
    await machine.transition(processor, "running");

    expect(processor.status).toBe("running");
  });

  test("4.4 - custom stateKey is used correctly", async () => {
    const machine = new StateMachine({
      initialState: "pending",
      stateKey: "orderStatus",
      transitions: { pending: { confirmed: {} } },
    });

    const order = { id: 1, orderStatus: "pending" };
    await machine.transition(order, "confirmed");

    expect(order.orderStatus).toBe("confirmed");
  });
});

// ### 5. **OnAfter Hook Consistency**
describe("OnAfter Hook Consistency", () => {
  test("5.1 - onAfter hooks execute after valid transition", async () => {
    const onAfter = jest.fn();
    const globalAfter = jest.fn();
    const machine = new StateMachine({
      initialState: "idle",
      transitions: { idle: { running: { onAfter } } },
      globalHooks: { afterTransition: [globalAfter] },
    });

    const processor = createProcessor();
    await machine.transition(processor, "running");

    expect(onAfter).toHaveBeenCalled();
    expect(globalAfter).toHaveBeenCalled();
  });

  test("5.2 - onAfter does not affect the transition state", async () => {
    const machine = new StateMachine({
      initialState: "idle",
      transitions: {
        idle: {
          running: {
            onAfter: async (entity: any) => {
              entity.additionalProperty = "added";
            },
          },
        },
      },
    });

    const processor = createProcessor() as any;
    await machine.transition(processor, "running");

    expect(processor.status).toBe("running");
    expect(processor.additionalProperty).toBe("added");
  });

  test("5.3 - onAfter hooks are skipped on aborted transition", async () => {
    const onAfter = jest.fn();
    const globalAfter = jest.fn();
    const machine = new StateMachine({
      initialState: "idle",
      transitions: {
        idle: {
          running: {
            isAbortable: true,
            onBefore: async () => {
              throw new AbortTransition({ message: "Aborted" });
            },
            onAbort: jest.fn(),
            onAfter,
          },
        },
      },
      globalHooks: { afterTransition: [globalAfter] },
    });

    const processor = createProcessor();
    await machine.transition(processor, "running");

    expect(onAfter).not.toHaveBeenCalled();
    expect(globalAfter).not.toHaveBeenCalled();
  });
});

// ### 6. **Error Propagation**
describe("Error Propagation", () => {
  test("6.1 - errors in preTransition propagate to onError", async () => {
    const onError = jest.fn();
    const machine = new StateMachine({
      initialState: "idle",
      transitions: {
        idle: {
          running: {
            isAbortable: true,
            onBefore: async () => {
              throw new AbortTransition({ message: "PreTransition error" });
            },
            onAbort: jest.fn(),
          },
        },
      },
      globalHooks: { onError },
    });

    const processor = createProcessor();
    await machine.transition(processor, "running");

    expect(onError).toHaveBeenCalledWith(
      expect.any(AbortTransition),
      expect.objectContaining({ from: "idle", to: "running" }),
    );
  });

  test("6.2 - errors in postTransition propagate to onError", async () => {
    const onError = jest.fn();
    const machine = new StateMachine({
      initialState: "idle",
      transitions: {
        idle: {
          running: {
            onAfter: async () => {
              throw new Error("PostTransition error");
            },
          },
        },
      },
      globalHooks: { onError },
    });

    const processor = createProcessor();
    await machine.transition(processor, "running");

    expect(onError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ from: "idle", to: "running" }),
    );
  });

  test("6.3 - onError invocation stops further state changes", async () => {
    const onError = jest.fn();
    const onAfter = jest.fn();
    const machine = new StateMachine({
      initialState: "idle",
      transitions: {
        idle: {
          running: {
            isAbortable: true,
            onBefore: async () => {
              throw new AbortTransition({ message: "Stop transition" });
            },
            onAbort: jest.fn(),
            onAfter,
          },
        },
      },
      globalHooks: { onError },
    });

    const processor = createProcessor();
    await machine.transition(processor, "running");

    expect(onError).toHaveBeenCalled();
    expect(onAfter).not.toHaveBeenCalled();
  });

  test("6.4 - onInvalidTransition is called for invalid state transitions", async () => {
    const onInvalidTransition = jest.fn();
    const machine = new StateMachine({
      initialState: "idle",
      transitions: { idle: { running: {} } },
      globalHooks: { onInvalidTransition },
    });

    const processor = createProcessor();
    await machine.transition(processor, "invalid_state");

    expect(onInvalidTransition).toHaveBeenCalledWith(
      expect.objectContaining({ from: "idle", to: "invalid_state" }),
    );
  });
});

// ### 7. **Edge Case Handling**
describe("Edge Case Handling", () => {
  test("7.1 - preTransition failure calls onAbort with no state change", async () => {
    const onAbort = jest.fn();
    const machine = new StateMachine({
      initialState: "idle",
      transitions: {
        idle: {
          running: {
            isAbortable: true,
            onBefore: async () => {
              throw new AbortTransition({ message: "PreTransition failed" });
            },
            onAbort,
          },
        },
      },
    });

    const processor = createProcessor();
    await machine.transition(processor, "running");

    expect(onAbort).toHaveBeenCalled();
    expect(processor.status).toBe("idle");
  });

  test("7.2 - multiple async hooks execute and maintain state consistency", async () => {
    const executionOrder: string[] = [];
    const machine = new StateMachine({
      initialState: "idle",
      transitions: {
        idle: {
          running: {
            onBefore: async () => {
              await new Promise((r) => setTimeout(r, 10));
              executionOrder.push("onBefore");
            },
            onAfter: async () => {
              await new Promise((r) => setTimeout(r, 10));
              executionOrder.push("onAfter");
            },
          },
        },
      },
      globalHooks: {
        beforeTransition: [
          async () => {
            executionOrder.push("globalBefore1");
          },
          async () => {
            executionOrder.push("globalBefore2");
          },
        ],
        afterTransition: [
          async () => {
            executionOrder.push("globalAfter1");
          },
          async () => {
            executionOrder.push("globalAfter2");
          },
        ],
      },
    });

    const processor = createProcessor();
    await machine.transition(processor, "running");

    expect(processor.status).toBe("running");
    expect(executionOrder).toContain("onBefore");
    expect(executionOrder).toContain("onAfter");
  });

  test("7.3 - sequential transitions work correctly", async () => {
    const machine = new StateMachine({
      initialState: "idle",
      transitions: {
        idle: { running: {} },
        running: { paused: {}, stopped: {} },
        paused: { running: {} },
      },
    });

    const processor = createProcessor();

    await machine.transition(processor, "running");
    expect(processor.status).toBe("running");

    await machine.transition(processor, "paused");
    expect(processor.status).toBe("paused");

    await machine.transition(processor, "running");
    expect(processor.status).toBe("running");

    await machine.transition(processor, "stopped");
    expect(processor.status).toBe("stopped");
  });

  test("7.4 - non-abortable transition with error does not call onAbort", async () => {
    const onAbort = jest.fn();
    const onError = jest.fn();
    const machine = new StateMachine({
      initialState: "idle",
      transitions: {
        idle: {
          running: {
            isAbortable: false,
            onBefore: async () => {
              throw new AbortTransition({ message: "Error" });
            },
            onAbort,
          },
        },
      },
      globalHooks: { onError },
    });

    const processor = createProcessor();
    await machine.transition(processor, "running");

    expect(onAbort).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalled();
  });
});

// ### 8. **Unit Tests for Async Hooks**
describe("Async Hooks", () => {
  test("8.1 - async hooks are awaited properly and execution order is correct", async () => {
    const order: string[] = [];
    const machine = new StateMachine({
      initialState: "idle",
      transitions: {
        idle: {
          running: {
            onBefore: async () => {
              await new Promise((r) => setTimeout(r, 50));
              order.push("onBefore");
            },
            onAfter: async () => {
              await new Promise((r) => setTimeout(r, 50));
              order.push("onAfter");
            },
          },
        },
      },
    });

    const processor = createProcessor();
    await machine.transition(processor, "running");

    expect(order.indexOf("onBefore")).toBeLessThan(order.indexOf("onAfter"));
  });

  test("8.2 - rejected promises in async hooks are handled", async () => {
    const onError = jest.fn();
    const machine = new StateMachine({
      initialState: "idle",
      transitions: {
        idle: {
          running: {
            onBefore: async () => {
              return Promise.reject(new Error("Promise rejected"));
            },
          },
        },
      },
      globalHooks: { onError },
    });

    const processor = createProcessor();
    await machine.transition(processor, "running");

    expect(onError).toHaveBeenCalledWith(expect.any(Error), expect.anything());
  });

  test("8.3 - global beforeTransition hooks run in parallel", async () => {
    const startTimes: number[] = [];
    const machine = new StateMachine({
      initialState: "idle",
      transitions: { idle: { running: {} } },
      globalHooks: {
        beforeTransition: [
          async () => {
            startTimes.push(Date.now());
            await new Promise((r) => setTimeout(r, 100));
          },
          async () => {
            startTimes.push(Date.now());
            await new Promise((r) => setTimeout(r, 100));
          },
        ],
      },
    });

    const processor = createProcessor();
    await machine.transition(processor, "running");

    expect(Math.abs(startTimes[0] - startTimes[1])).toBeLessThan(20);
  });
});

// ### 9. **Snapshot State Before Transition**
describe("Snapshot State Before Transition", () => {
  test("9.1 - snapshot of entity state is taken before changes", async () => {
    let snapshotStatus: string | undefined;
    const machine = new StateMachine({
      initialState: "idle",
      transitions: {
        idle: {
          running: {
            onBefore: async (entity: any) => {
              snapshotStatus = entity.status;
            },
          },
        },
      },
    });

    const processor = createProcessor();
    await machine.transition(processor, "running");

    expect(snapshotStatus).toBe("idle");
    expect(processor.status).toBe("running");
  });

  test("9.2 - snapshot is used to restore state on abort", async () => {
    const machine = new StateMachine({
      initialState: "idle",
      transitions: {
        idle: {
          running: {
            isAbortable: true,
            onBefore: async () => {
              throw new AbortTransition({ message: "Restore me" });
            },
            onAbort: jest.fn(),
          },
        },
      },
    });

    const processor = createProcessor();
    await machine.transition(processor, "running");

    expect(processor.status).toBe("idle");
  });
});

// ### 10. **Integration Tests - Processor Example**
describe("Integration Tests - Processor Example", () => {
  test("processor transitions from idle to running when paid", async () => {
    const machine = new StateMachine({
      initialState: "idle",
      transitions: {
        idle: {
          running: {
            isAbortable: true,
            onBefore: async (processor: any) => {
              if (!processor.paid) {
                throw new AbortTransition({
                  message: "Processor is not paid",
                  meta: { code: "429" },
                });
              }
            },
            onAbort: jest.fn(),
          },
          stopped: {},
        },
      },
    });

    const processor = createProcessor({ paid: true });
    await machine.transition(processor, "running");

    expect(processor.status).toBe("running");
  });

  test("processor transition is aborted when not paid", async () => {
    const onAbort = jest.fn();
    const machine = new StateMachine({
      initialState: "idle",
      transitions: {
        idle: {
          running: {
            isAbortable: true,
            onBefore: async (processor: any) => {
              if (!processor.paid) {
                throw new AbortTransition({
                  message: "Processor is not paid",
                  meta: { code: "429" },
                });
              }
            },
            onAbort,
          },
          stopped: {},
        },
      },
    });

    const processor = createProcessor({ paid: false });
    await machine.transition(processor, "running");

    expect(onAbort).toHaveBeenCalled();
    expect(processor.status).toBe("idle");
  });

  test("full processor lifecycle with multiple transitions", async () => {
    const transitionLog: string[] = [];
    const machine = new StateMachine({
      initialState: "idle",
      transitions: {
        idle: { running: {}, stopped: {} },
        running: { paused: {}, stopped: {}, completed: {} },
        paused: { running: {}, stopped: {} },
        stopped: {},
        completed: {},
      },
      globalHooks: {
        afterTransition: [
          async (payload) => {
            transitionLog.push(`${payload.from}->${payload.to}`);
          },
        ],
      },
    });

    const processor = createProcessor();

    await machine.transition(processor, "running");
    await machine.transition(processor, "paused");
    await machine.transition(processor, "running");
    await machine.transition(processor, "completed");

    expect(transitionLog).toEqual([
      "idle->running",
      "running->paused",
      "paused->running",
      "running->completed",
    ]);
    expect(processor.status).toBe("completed");
  });
});

// ### 11. **Default onAbort Handler**
describe("Default onAbort Handler", () => {
  test("default onAbort is assigned when isAbortable is true and onAbort is not provided", async () => {
    const consoleSpy = jest.spyOn(console, "log").mockImplementation();
    const machine = new StateMachine({
      initialState: "idle",
      transitions: {
        idle: {
          running: {
            isAbortable: true,
            onBefore: async () => {
              throw new AbortTransition({ message: "Test abort" });
            },
          },
        },
      },
    });

    const processor = createProcessor();
    await machine.transition(processor, "running");

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("Aborting transition from idle to running"),
    );
    consoleSpy.mockRestore();
  });
});

// ### 12. **Context & Metadata Handling**
describe("Context & Metadata Handling", () => {
  test("12.1 - context.actor and context.meta propagate correctly to onBefore", async () => {
    let receivedEntity: any;
    const machine = new StateMachine({
      initialState: "idle",
      transitions: {
        idle: {
          running: {
            onBefore: async (entity) => {
              receivedEntity = entity;
            },
          },
        },
      },
    });

    const processor = createProcessor();
    await machine.transition(processor, "running", {
      actor: "TestActor",
      meta: { key: "value" },
    });

    expect(receivedEntity).toBeDefined();
    expect(processor.status).toBe("running");
  });

  test("12.2 - context.actor and context.meta propagate correctly to onAfter", async () => {
    let receivedEntity: any;
    const machine = new StateMachine({
      initialState: "idle",
      transitions: {
        idle: {
          running: {
            onAfter: async (entity) => {
              receivedEntity = entity;
            },
          },
        },
      },
    });

    const processor = createProcessor();
    await machine.transition(processor, "running", {
      actor: "TestActor",
      meta: { key: "value" },
    });

    expect(receivedEntity).toBeDefined();
  });

  test("12.3 - context.actor and context.meta propagate correctly to global hooks", async () => {
    let receivedPayload: any;
    const machine = new StateMachine({
      initialState: "idle",
      transitions: { idle: { running: {} } },
      globalHooks: {
        beforeTransition: [
          async (payload) => {
            receivedPayload = payload;
          },
        ],
      },
    });

    const processor = createProcessor();
    await machine.transition(processor, "running", {
      actor: "TestActor",
      meta: { key: "value" },
    });

    expect(receivedPayload.actor).toBe("TestActor");
    expect(receivedPayload.meta).toEqual({ key: "value" });
  });

  test("12.4 - transition works with undefined context (no crashes)", async () => {
    const machine = new StateMachine({
      initialState: "idle",
      transitions: { idle: { running: {} } },
    });

    const processor = createProcessor();
    await machine.transition(processor, "running");

    expect(processor.status).toBe("running");
  });
});

// ### 13. **Error Payloads**
describe("Error Payloads", () => {
  test("13.1 - AbortTransition payload includes from, to, timestamp, message, meta", async () => {
    let abortPayload: any;
    const machine = new StateMachine({
      initialState: "idle",
      transitions: {
        idle: {
          running: {
            isAbortable: true,
            onBefore: async () => {
              throw new AbortTransition({ message: "Test abort" });
            },
            onAbort: (payload) => {
              abortPayload = payload;
            },
          },
        },
      },
    });

    const processor = createProcessor();
    await machine.transition(processor, "running", {
      actor: "User1",
      meta: { test: true },
    });

    expect(abortPayload).toHaveProperty("from", "idle");
    expect(abortPayload).toHaveProperty("to", "running");
    expect(abortPayload).toHaveProperty("timestamp");
    expect(abortPayload).toHaveProperty("message");
    expect(abortPayload).toHaveProperty("meta");
  });

  test("13.2 - InvalidTransition payload includes from, to, timestamp, message, meta", async () => {
    let invalidPayload: any;
    const machine = new StateMachine({
      initialState: "idle",
      transitions: { idle: { running: {} } },
      globalHooks: {
        onInvalidTransition: (payload) => {
          invalidPayload = payload;
        },
      },
    });

    const processor = createProcessor();
    await machine.transition(processor, "invalid_state", {
      actor: "User1",
      meta: { test: true },
    });

    expect(invalidPayload).toHaveProperty("from", "idle");
    expect(invalidPayload).toHaveProperty("to", "invalid_state");
    expect(invalidPayload).toHaveProperty("timestamp");
    expect(invalidPayload).toHaveProperty("message");
  });

  test("13.3 - GlobalErrorPayload contains error object and metadata", async () => {
    let errorPayload: any;
    let errorObj: any;
    const machine = new StateMachine({
      initialState: "idle",
      transitions: {
        idle: {
          running: {
            onBefore: async () => {
              throw new Error("Test error");
            },
          },
        },
      },
      globalHooks: {
        onError: (error, payload) => {
          errorObj = error;
          errorPayload = payload;
        },
      },
    });

    const processor = createProcessor();
    await machine.transition(processor, "running", {
      actor: "User1",
      meta: { test: true },
    });

    expect(errorObj).toBeInstanceOf(Error);
    expect(errorPayload).toHaveProperty("from");
    expect(errorPayload).toHaveProperty("to");
    expect(errorPayload).toHaveProperty("timestamp");
  });
});

// ### 14. **Deep Clone & Rollback**
describe("Deep Clone & Rollback", () => {
  test("14.1 - deep cloning works correctly for nested objects in entity", async () => {
    const machine = new StateMachine({
      initialState: "idle",
      transitions: {
        idle: {
          running: {
            isAbortable: true,
            onBefore: async (entity: any) => {
              entity.nested.value = "modified";
              throw new AbortTransition({
                message: "Abort after modification",
              });
            },
            onAbort: jest.fn(),
          },
        },
      },
    });

    const processor = { status: "idle", nested: { value: "original" } };
    await machine.transition(processor, "running");

    expect(processor.status).toBe("idle");
  });

  test("14.2 - deep cloning works correctly for arrays in entity", async () => {
    const machine = new StateMachine({
      initialState: "idle",
      transitions: {
        idle: {
          running: {
            isAbortable: true,
            onBefore: async (entity: any) => {
              entity.items.push("new item");
              throw new AbortTransition({
                message: "Abort after modification",
              });
            },
            onAbort: jest.fn(),
          },
        },
      },
    });

    const processor = { status: "idle", items: ["item1", "item2"] };
    await machine.transition(processor, "running");

    expect(processor.status).toBe("idle");
  });

  test("14.3 - entity restores exactly to snapshot when abort occurs", async () => {
    const machine = new StateMachine({
      initialState: "idle",
      transitions: {
        idle: {
          running: {
            isAbortable: true,
            onBefore: async () => {
              throw new AbortTransition({ message: "Restore test" });
            },
            onAbort: jest.fn(),
          },
        },
      },
    });

    const processor = createProcessor({
      customField: "test",
      nested: { deep: "value" },
    }) as any;
    const originalProcessor = JSON.parse(JSON.stringify(processor));

    await machine.transition(processor, "running");

    expect(processor.status).toBe(originalProcessor.status);
    expect(processor.customField).toBe(originalProcessor.customField);
  });
});

// ### 15. **Multiple Transitions / Concurrency**
describe("Multiple Transitions / Concurrency", () => {
  test("15.1 - sequential transitions in quick succession maintain consistency", async () => {
    const machine = new StateMachine({
      initialState: "idle",
      transitions: {
        idle: { running: {} },
        running: { paused: {}, completed: {} },
        paused: { running: {} },
      },
    });

    const processor = createProcessor();

    await machine.transition(processor, "running");
    await machine.transition(processor, "paused");
    await machine.transition(processor, "running");
    await machine.transition(processor, "completed");

    expect(processor.status).toBe("completed");
  });

  test("15.2 - parallel transitions on different entities don't interfere", async () => {
    const machine = new StateMachine({
      initialState: "idle",
      transitions: {
        idle: { running: {} },
        running: { completed: {} },
      },
    });

    const processors = Array.from({ length: 10 }, (_, i) =>
      createProcessor({ id: i }),
    );

    await Promise.all(processors.map((p) => machine.transition(p, "running")));

    processors.forEach((p) => {
      expect(p.status).toBe("running");
    });

    await Promise.all(
      processors.map((p) => machine.transition(p, "completed")),
    );

    processors.forEach((p) => {
      expect(p.status).toBe("completed");
    });
  });
});

// ### 16. **Hooks Edge Cases**
describe("Hooks Edge Cases", () => {
  test("16.1 - errors inside onAfter propagate to onError", async () => {
    const onError = jest.fn();
    const machine = new StateMachine({
      initialState: "idle",
      transitions: {
        idle: {
          running: {
            onAfter: async () => {
              throw new Error("onAfter error");
            },
          },
        },
      },
      globalHooks: { onError },
    });

    const processor = createProcessor();
    await machine.transition(processor, "running");

    expect(onError).toHaveBeenCalled();
  });

  test("16.2 - errors inside global afterTransition propagate to onError", async () => {
    const onError = jest.fn();
    const machine = new StateMachine({
      initialState: "idle",
      transitions: { idle: { running: {} } },
      globalHooks: {
        afterTransition: [
          async () => {
            throw new Error("Global after error");
          },
        ],
        onError,
      },
    });

    const processor = createProcessor();
    await machine.transition(processor, "running");

    expect(onError).toHaveBeenCalled();
  });

  test("16.3 - async hooks reject and don't block other hooks", async () => {
    const onError = jest.fn();
    const secondHookCalled = jest.fn();
    const machine = new StateMachine({
      initialState: "idle",
      transitions: { idle: { running: {} } },
      globalHooks: {
        beforeTransition: [
          async () => {
            throw new Error("First hook error");
          },
          async () => {
            secondHookCalled();
          },
        ],
        onError,
      },
    });

    const processor = createProcessor();
    await machine.transition(processor, "running");

    expect(onError).toHaveBeenCalled();
  });
});

// ### 17. **Custom State Keys**
describe("Custom State Keys", () => {
  test("17.1 - custom stateKey works for preTransition", async () => {
    const onBefore = jest.fn();
    const machine = new StateMachine({
      initialState: "pending",
      stateKey: "orderStatus",
      transitions: { pending: { confirmed: { onBefore } } },
    });

    const order = { id: 1, orderStatus: "pending" };
    await machine.transition(order, "confirmed");

    expect(onBefore).toHaveBeenCalled();
  });

  test("17.2 - custom stateKey works for postTransition", async () => {
    const onAfter = jest.fn();
    const machine = new StateMachine({
      initialState: "pending",
      stateKey: "orderStatus",
      transitions: { pending: { confirmed: { onAfter } } },
    });

    const order = { id: 1, orderStatus: "pending" };
    await machine.transition(order, "confirmed");

    expect(onAfter).toHaveBeenCalled();
    expect(order.orderStatus).toBe("confirmed");
  });

  test("17.3 - custom stateKey works for snapshot/rollback", async () => {
    const machine = new StateMachine({
      initialState: "pending",
      stateKey: "orderStatus",
      transitions: {
        pending: {
          confirmed: {
            isAbortable: true,
            onBefore: async () => {
              throw new AbortTransition({ message: "Rollback test" });
            },
            onAbort: jest.fn(),
          },
        },
      },
    });

    const order = { id: 1, orderStatus: "pending" };
    await machine.transition(order, "confirmed");

    expect(order.orderStatus).toBe("pending");
  });
});

// ### 18. **Non-Abortable Errors**
describe("Non-Abortable Errors", () => {
  test("18.1 - errors in non-abortable transitions are logged correctly", async () => {
    const consoleSpy = jest.spyOn(console, "log").mockImplementation();
    const machine = new StateMachine({
      initialState: "idle",
      transitions: {
        idle: {
          running: {
            isAbortable: false,
            onBefore: async () => {
              throw new Error("Non-abortable error");
            },
          },
        },
      },
    });

    const processor = createProcessor();
    await machine.transition(processor, "running");

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  test("18.2 - errors in non-abortable transitions propagate without rollback", async () => {
    const onError = jest.fn();
    const onAbort = jest.fn();
    const machine = new StateMachine({
      initialState: "idle",
      transitions: {
        idle: {
          running: {
            isAbortable: false,
            onBefore: async () => {
              throw new Error("Error without rollback");
            },
            onAbort,
          },
        },
      },
      globalHooks: { onError },
    });

    const processor = createProcessor();
    await machine.transition(processor, "running");

    expect(onError).toHaveBeenCalled();
    expect(onAbort).not.toHaveBeenCalled();
  });
});

// ### 19. **Missing Hooks**
describe("Missing Hooks", () => {
  test("19.1 - transition works when onBefore is not defined", async () => {
    const machine = new StateMachine({
      initialState: "idle",
      transitions: { idle: { running: {} } },
    });

    const processor = createProcessor();
    await machine.transition(processor, "running");

    expect(processor.status).toBe("running");
  });

  test("19.2 - transition works when onAfter is not defined", async () => {
    const machine = new StateMachine({
      initialState: "idle",
      transitions: { idle: { running: { onBefore: jest.fn() } } },
    });

    const processor = createProcessor();
    await machine.transition(processor, "running");

    expect(processor.status).toBe("running");
  });

  test("19.3 - transition works when onAbort is not defined (non-abortable)", async () => {
    const machine = new StateMachine({
      initialState: "idle",
      transitions: { idle: { running: { isAbortable: false } } },
    });

    const processor = createProcessor();
    await machine.transition(processor, "running");

    expect(processor.status).toBe("running");
  });

  test("19.4 - transition works when no global hooks are defined", async () => {
    const machine = new StateMachine({
      initialState: "idle",
      transitions: { idle: { running: {} } },
    });

    const processor = createProcessor();
    await machine.transition(processor, "running");

    expect(processor.status).toBe("running");
  });
});

// ### 20. **Global Hooks Integration**
describe("Global Hooks Integration", () => {
  test("20.1 - global beforeTransition executes correctly across multiple transitions", async () => {
    const beforeCalls: string[] = [];
    const machine = new StateMachine({
      initialState: "idle",
      transitions: {
        idle: { running: {} },
        running: { completed: {} },
      },
      globalHooks: {
        beforeTransition: [
          async (payload) => {
            beforeCalls.push(`${payload.from}->${payload.to}`);
          },
        ],
      },
    });

    const processor = createProcessor();
    await machine.transition(processor, "running");
    await machine.transition(processor, "completed");

    expect(beforeCalls).toEqual(["idle->running", "running->completed"]);
  });

  test("20.2 - global afterTransition executes correctly across multiple transitions", async () => {
    const afterCalls: string[] = [];
    const machine = new StateMachine({
      initialState: "idle",
      transitions: {
        idle: { running: {} },
        running: { completed: {} },
      },
      globalHooks: {
        afterTransition: [
          async (payload) => {
            afterCalls.push(`${payload.from}->${payload.to}`);
          },
        ],
      },
    });

    const processor = createProcessor();
    await machine.transition(processor, "running");
    await machine.transition(processor, "completed");

    expect(afterCalls).toEqual(["idle->running", "running->completed"]);
  });

  test("20.3 - global onError executes correctly across multiple error scenarios", async () => {
    const errorCalls: string[] = [];
    const machine = new StateMachine({
      initialState: "idle",
      transitions: {
        idle: {
          running: {
            onBefore: async () => {
              throw new Error("Error 1");
            },
          },
        },
      },
      globalHooks: {
        onError: (error) => {
          errorCalls.push(error.message);
        },
      },
    });

    const processor1 = createProcessor();
    const processor2 = createProcessor();

    await machine.transition(processor1, "running");
    await machine.transition(processor2, "running");

    expect(errorCalls).toEqual(["Error 1", "Error 1"]);
  });

  test("20.4 - global onInvalidTransition executes correctly for all invalid attempts", async () => {
    const invalidCalls: string[] = [];
    const machine = new StateMachine({
      initialState: "idle",
      transitions: { idle: { running: {} } },
      globalHooks: {
        onInvalidTransition: (payload) => {
          invalidCalls.push(`${payload.from}->${payload.to}`);
        },
      },
    });

    const processor = createProcessor();
    await machine.transition(processor, "invalid1");
    await machine.transition(processor, "invalid2");

    expect(invalidCalls).toEqual(["idle->invalid1", "idle->invalid2"]);
  });
});

// ### 21. **Stress / Large Dataset**
describe("Stress / Large Dataset", () => {
  test("21.1 - hundreds of entities transitioning simultaneously", async () => {
    const machine = new StateMachine({
      initialState: "idle",
      transitions: {
        idle: { running: {} },
        running: { completed: {} },
      },
    });

    const entities = Array.from({ length: 100 }, (_, i) =>
      createProcessor({ id: i }),
    );

    await Promise.all(entities.map((e) => machine.transition(e, "running")));

    entities.forEach((e) => {
      expect(e.status).toBe("running");
    });

    await Promise.all(entities.map((e) => machine.transition(e, "completed")));

    entities.forEach((e) => {
      expect(e.status).toBe("completed");
    });
  });

  test("21.2 - no state leakage between different entity transitions", async () => {
    const transitionLog: { id: number; from: string; to: string }[] = [];
    const machine = new StateMachine({
      initialState: "idle",
      transitions: {
        idle: { running: {} },
        running: { completed: {} },
      },
      globalHooks: {
        afterTransition: [
          async (payload) => {
            transitionLog.push({
              id: payload.meta?.id,
              from: payload.from,
              to: payload.to,
            });
          },
        ],
      },
    });

    const entities = Array.from({ length: 50 }, (_, i) =>
      createProcessor({ id: i }),
    );

    await Promise.all(
      entities.map((e) =>
        machine.transition(e, "running", { actor: "test", meta: { id: e.id } }),
      ),
    );

    // Verify each entity logged correctly
    entities.forEach((e) => {
      const log = transitionLog.find(
        (l) => l.id === e.id && l.to === "running",
      );
      expect(log).toBeDefined();
      expect(log?.from).toBe("idle");
    });

    // Verify no duplicate or incorrect entries
    expect(transitionLog.length).toBe(50);
  });
});
