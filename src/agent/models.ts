export type AgentModelProfile = {
  id: string;
  label: string;
  route: string;
  available: boolean;
  note?: string;
};

export const AGENT_MODEL_PROFILES: AgentModelProfile[] = [
  {
    id: 'claude-fable-5',
    label: 'Claude Fable 5',
    route: 'cc/claude-fable-5',
    available: true,
  },
  {
    id: 'claude-sonnet-5',
    label: 'Claude Sonnet 5',
    route: 'cc/claude-sonnet-5',
    available: true,
  },
  {
    id: 'claude-opus-4-8-high',
    label: 'Claude Opus 4.8 Alto',
    route: 'cc/claude-opus-4-8(max)',
    available: true,
  },
  { id: 'gpt-5-6-sol', label: 'GPT 5.6 Sol Normal', route: 'cx/gpt-5.6-sol', available: true },
  { id: 'gpt-5-6-sol-high', label: 'GPT 5.6 Sol High', route: 'cx/gpt-5.6-sol-high', available: true },
  { id: 'gpt-5-6-sol-xhigh', label: 'GPT 5.6 Sol xhigh', route: 'cx/gpt-5.6-sol-xhigh', available: true },
  { id: 'gpt-5-6-sol-ultra', label: 'GPT 5.6 Sol Ultra', route: 'cx/gpt-5.6-sol-xhigh', available: true },
  { id: 'gpt-5-6-luna-xhigh', label: 'GPT 5.6 Luna xhigh', route: 'cx/gpt-5.6-luna-xhigh', available: true },
  { id: 'gpt-5-6-luna-ultra', label: 'GPT 5.6 Luna Ultra', route: 'cx/gpt-5.6-luna-xhigh', available: true },
  { id: 'gpt-5-5-xhigh', label: 'GPT 5.5 xhigh', route: 'cx/gpt-5.5-xhigh', available: true },
  {
    id: 'grok-4-5',
    label: 'Grok 4.5',
    route: 'gcli/grok-4.5',
    available: true,
  },
];

export const AGENT_MODEL_ROUTES = [...new Set(AGENT_MODEL_PROFILES.map((profile) => profile.route))];

export function getAgentModelProfile(id: string) {
  return AGENT_MODEL_PROFILES.find((profile) => profile.id === id);
}
