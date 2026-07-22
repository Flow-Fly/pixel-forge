export type ServerLogDetails = Readonly<Record<string, boolean | number | string | undefined>>;

export interface ServerLogger {
  error(event: string, details: ServerLogDetails): void;
  info(event: string, details: ServerLogDetails): void;
}

function writeLog(
  write: (message: string) => void,
  event: string,
  details: ServerLogDetails
): void {
  write(JSON.stringify({ event, ...details }));
}

export const consoleServerLogger: ServerLogger = {
  error(event, details) {
    writeLog(console.error, event, details);
  },
  info(event, details) {
    writeLog(console.info, event, details);
  },
};

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown server error';
}
