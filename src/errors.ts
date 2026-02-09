import { TransitionParams } from "./types";

export class AbortTransition extends Error {
  details: TransitionParams;

  constructor(params: TransitionParams = {}) {
    super(params.message || "Aborting transition");
    this.name = "AbortTransition";
    this.details = {
      timestamp: params.timestamp ?? new Date(),
      ...params,
    };
  }
}

export class InvalidTransition extends Error {
  details: TransitionParams;

  constructor(params: TransitionParams = {}) {
    super(params.message || "Invalid transition");
    this.name = "InvalidTransition";
    this.details = {
      timestamp: params.timestamp ?? new Date(),
      ...params,
    };
  }
}
