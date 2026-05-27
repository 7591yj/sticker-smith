import type { ConversionMode, StickerId } from "./base";

export interface ConversionTask {
  stickerId: StickerId;
  sourcePath: string;
  mode: ConversionMode;
  outputPath: string;
}

export interface ImportConversionTask {
  sourcePath: string;
  originalFileName: string;
  outputPath: string;
}

export interface ConversionJobRequest {
  jobId: string;
  outputRoot: string;
  tasks: ConversionTask[];
}
