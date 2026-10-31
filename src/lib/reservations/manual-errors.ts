export class ManualReservationError extends Error {
  readonly code: string;
  readonly operationId: string;
  readonly state?: "pending";
  readonly status: number;

  constructor(message: string, input: {
    code: string;
    operationId: string;
    status: number;
    state?: "pending";
  }) {
    super(message);
    this.name = "ManualReservationError";
    this.code = input.code;
    this.operationId = input.operationId;
    this.state = input.state;
    this.status = input.status;
  }
}
