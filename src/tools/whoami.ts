import { z } from 'zod';

import type { MiteAccount, MiteMyself } from '../mite/types.js';
import { defineTool, result } from './definition.js';

export const whoami = defineTool({
  name: 'mite_whoami',
  title: 'Who am I in mite',
  description:
    'Shows the mite account, the user behind the API key and its role, plus the mode and ' +
    'tools this server offers. Call it first to learn what you are allowed to do.',
  mode: 'read-only',
  annotations: { readOnlyHint: true, openWorldHint: true },
  inputSchema: z.object({}),
  handler: async (_input, { client, config, enabledTools }) => {
    const [account, myself] = await Promise.all([
      client.get<MiteAccount>('/account.json'),
      client.get<MiteMyself>('/myself.json'),
    ]);
    const data = {
      account: {
        name: account.account.name,
        title: account.account.title,
        currency: account.account.currency,
      },
      user: { id: myself.user.id, name: myself.user.name, role: myself.user.role },
      server: { mode: config.mode, tools: [...enabledTools] },
    };
    const text = [
      `Account: ${JSON.stringify(data.account.title)} (${data.account.name}), currency ${data.account.currency}`,
      `User: ${JSON.stringify(data.user.name)}, role ${data.user.role}`,
      `Server mode: ${data.server.mode}; tools: ${data.server.tools.join(', ')}`,
    ].join('\n');
    return result(text, data);
  },
});
