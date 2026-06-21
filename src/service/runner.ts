import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface CommandRunner {
  exec(command: string, args: string[], options?: { cwd?: string }): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
  }>;
}

export const defaultCommandRunner: CommandRunner = {
  async exec(command, args, options) {
    try {
      const result = await execFileAsync(command, args, {
        cwd: options?.cwd,
        encoding: "utf8",
        windowsHide: true,
      });
      return {
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
        exitCode: 0,
      };
    } catch (error) {
      const execError = error as NodeJS.ErrnoException & {
        stdout?: string;
        stderr?: string;
        code?: string | number;
      };
      return {
        stdout: execError.stdout ?? "",
        stderr: execError.stderr ?? execError.message,
        exitCode: typeof execError.code === "number" ? execError.code : 1,
      };
    }
  },
};
