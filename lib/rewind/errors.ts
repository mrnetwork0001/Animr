/** A VERSUS request the client can fix or retry; `status` is the HTTP status to answer with. Its message is safe to show. */
export class VersusError extends Error {
  name = "VersusError";
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
