export const SYSTEM_INSTRUCTION: string;
export function buildSchema(SchemaType: any): any;
export const AGENT_INSTRUCTION: string;
export const AGENT_ACTIONS: string[];
export function buildAgentSchema(SchemaType: any): any;
export function buildAgentPrompt(args: {
  goal: string; language: string; log: string[]; notes?: string;
  screen: { package: string; text: string; width: number; height: number };
}): string;
