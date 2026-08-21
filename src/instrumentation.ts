import { logErrorAndFlush } from "@/lib/monitoring";

type ProcessWithMonitoring = typeof process & {
  __bagelitoFatalExitStarted?: boolean;
  __bagelitoMonitoringHandlersRegistered?: boolean;
};

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const processWithMonitoring = process as ProcessWithMonitoring;
  if (processWithMonitoring.__bagelitoMonitoringHandlersRegistered) return;

  processWithMonitoring.__bagelitoMonitoringHandlersRegistered = true;

  function flushFatalRuntimeError(msg: string, error: unknown) {
    if (processWithMonitoring.__bagelitoFatalExitStarted) return;
    processWithMonitoring.__bagelitoFatalExitStarted = true;
    process.exitCode = 1;

    const forceExitTimer = setTimeout(() => {
      process.exit(1);
    }, 5_000);
    forceExitTimer.unref();

    void logErrorAndFlush(msg, error, {
      runtime: "nodejs",
      source: "instrumentation",
    }).finally(() => {
      clearTimeout(forceExitTimer);
      process.exit(1);
    });
  }

  process.on("unhandledRejection", (reason) => {
    flushFatalRuntimeError("runtime_unhandled_rejection", reason);
  });

  process.once("uncaughtException", (error) => {
    flushFatalRuntimeError("runtime_uncaught_exception", error);
  });
}
