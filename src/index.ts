import { AbortTransition, InvalidTransition } from "./errors";
import {
  TransitionPayload,
  EventHandler,
  PreTransitionParams,
  PostTransitionParams,
  MachineConfig,
  NormalizedMachineconfig,
} from "./types";

export class StateMachine {
  private handlers: { [event: string]: EventHandler[] } = {};
  private readonly config: NormalizedMachineconfig;

  constructor(config: MachineConfig) {
    const transitionKeys = Object.keys(config.transitions);
    transitionKeys.forEach((tK) => {
      const nextStates = Object.keys(config.transitions[tK]);
      nextStates.forEach((nS) => {
        if (
          config.transitions[tK][nS].isAbortable &&
          !config.transitions[tK][nS].onAbort
        ) {
          config.transitions[tK][nS].onAbort = () => {
            console.log(`Aborting transition from ${tK} to ${nS}`);
          };
        }
      });
    });
    this.config = {
      ...config,
      stateKey: config.stateKey ?? "status",
    } as NormalizedMachineconfig;
  }

  async preTransition(params: PreTransitionParams) {
    const {
      currentState,
      nextState,
      nextTransition,
      allowedNextStates,
      entity,
      context,
    } = params;
    if (!(nextState in allowedNextStates)) {
      throw new InvalidTransition({
        message: "Invalid Transaction",
        from: currentState,
        to: nextState,
        meta: context,
      });
    }

    nextTransition.onBefore && (await nextTransition.onBefore(entity));

    const beforeTransitionHooks = this.config.globalHooks?.beforeTransition;
    const payload: TransitionPayload = {
      from: currentState,
      to: nextState,
      actor: context?.actor,
      meta: context?.meta,
      timestamp: new Date(),
    };

    const hooks = beforeTransitionHooks ?? [];
    await Promise.all(hooks.map((fn) => fn(payload)));
  }

  async transition(
    entity: any,
    nextState: string,
    context?: { actor: string; meta?: any },
  ) {
    const stateKey = this.config.stateKey;
    const currentState = entity[stateKey];
    const allowedNextStates = this.config.transitions[currentState];
    const nextTransition = allowedNextStates[nextState];

    const entitySnapshot = structuredClone(entity);
    try {
      await this.preTransition({
        currentState,
        allowedNextStates,
        nextState,
        nextTransition,
        entity,
        context,
      });
      entity[stateKey] = nextState;
      await this.postTransition({
        currentState,
        nextState,
        entity,
        nextTransition,
        stateKey,
        context,
      });
    } catch (e) {
      const error = e as Error;
      if (e instanceof InvalidTransition) {
        const invalidTransitionErrorPayload = {
          from: currentState,
          to: nextState,
          message: error?.message ? error.message : "Invalid transition.",
          timestamp: new Date(),
          meta: context,
        };
        this.config.globalHooks?.onInvalidTransition?.(
          invalidTransitionErrorPayload,
        );
      }
      if (nextTransition?.isAbortable && e instanceof AbortTransition) {
        entity = structuredClone(entitySnapshot);
        const abortTransitionErrorPayload = {
          from: currentState,
          to: nextState,
          message: error?.message ? error.message : "Aborting transition.",
          timestamp: new Date(),
          meta: context,
        };
        nextTransition.onAbort?.(abortTransitionErrorPayload);
      } else {
        console.log(
          "Abort Transition triggered but skipped over transition {isAbortable:false} ",
          error,
        );
      }
      if (this.config.globalHooks?.onError) {
        const errorPaylaod = {
          from: currentState,
          to: nextState,
          message: error?.message ? error.message : "Aborting transition.",
          timestamp: new Date(),
          meta: context,
        };
        this.config.globalHooks?.onError?.(error, errorPaylaod);
      }
    }
  }

  async postTransition(params: PostTransitionParams) {
    const {
      currentState,
      nextState,
      nextTransition,
      stateKey,
      entity,
      context,
    } = params;
    if (entity[stateKey] !== nextState) {
      throw new Error("Transition failed or had incongurencies");
    }

    nextTransition.onAfter && (await nextTransition.onAfter(entity));

    const afterTransitionHooks = this.config.globalHooks?.afterTransition;
    const payload: TransitionPayload = {
      from: currentState,
      to: nextState,
      actor: context?.actor,
      meta: context?.meta,
      timestamp: new Date(),
    };

    const hooks = afterTransitionHooks ?? [];
    await Promise.all(hooks.map((fn) => fn(payload)));
  }
  on(event: string, callback: EventHandler) {
    if (!this.handlers[event]) {
      this.handlers[event] = [];
    }
    this.handlers[event].push(callback);
  }

  emit(event: string) {
    this.handlers[event].forEach((fn) => fn());
  }
}
