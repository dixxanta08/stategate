export type TransitionParams = {
  from?: string;
  to?: string;
  message?: string;
  timestamp?: Date;
  meta?: any;
};

export type TransitionPayload = {
  from: string;
  to: string;
  actor?: string;
  meta?: any;
  timestamp: Date;
};

export type EventHandler = (entity?: any) => Promise<void>;
export type AbortHandler = (errorPaylaod?: AbortTransitionErrorPayload) => void;
export type TransitionHandler = (payload: TransitionPayload) => Promise<void>;

export type InvalidTransitionHandler = (payload: TransitionPayload) => void;
export type ErrorTransitionHandler = (
  error: Error,
  payload: TransitionPayload,
) => void;

export type TransitionConfig = {
  isAbortable?: boolean;
  onBefore?: EventHandler;
  onAbort?: AbortHandler;
  onAfter?: EventHandler;
  details?: {
    label: string;
    description: string;
    allowedActors: string;
  };
};
export type PreTransitionParams = {
  currentState: string;
  allowedNextStates: Record<string, TransitionConfig>;
  nextState: string;
  nextTransition: TransitionConfig;
  entity: any;
  context?: {
    actor?: string;
    meta?: any;
  };
};
export type PostTransitionParams = {
  currentState: string;
  nextState: string;
  nextTransition: TransitionConfig;
  entity: any;
  stateKey: string;
  context?: {
    actor?: string;
    meta?: any;
  };
};

export type MachineConfig = {
  initialState: string;
  stateKey?: string;
  transitions: Record<string, Record<string, TransitionConfig>>;
  globalHooks?: {
    beforeTransition?: TransitionHandler[];
    afterTransition?: TransitionHandler[];
    onInvalidTransition?: InvalidTransitionHandler;
    onError?: ErrorTransitionHandler;
  };
};
export type NormalizedMachineconfig = Omit<MachineConfig, "stateKey"> & {
  stateKey: string;
};

export type BaseErrorPayload<TMeta = any> = {
  message: string;
  timestamp: Date;
  meta?: TMeta;
};

export type AbortTransitionErrorPayload<TMeta = any> =
  BaseErrorPayload<TMeta> & {
    from: string;
    to: string;
  };

export type GlobalErrorPayload<TMeta = any> = BaseErrorPayload<TMeta> & {
  error: Error;
};
