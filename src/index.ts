import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';

const server = new McpServer({ name: 'cloudflare-mcp', version: '1.0.0' });

// Tool to list zones
server.registerTool(
  'list-zones',
  {
    title: 'List Zones',
    description: 'List all Cloudflare zones for the account',
    inputSchema: z.object({
      apiToken: z.string().describe('Cloudflare API token')
    })
  },
  async ({ apiToken }) => {
    try {
      const response = await fetch('https://api.cloudflare.com/client/v4/zones', {
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json'
        }
      });
      const data = await response.json();
      if (data.success) {
        const zones = data.result.map((zone: any) => ({
          id: zone.id,
          name: zone.name,
          status: zone.status
        }));
        return { content: [{ type: 'text', text: JSON.stringify(zones, null, 2) }] };
      } else {
        return { content: [{ type: 'text', text: `Error: ${data.errors.map((e: any) => e.message).join(', ')}` }] };
      }
    } catch (error) {
      return { content: [{ type: 'text', text: `Error: ${error.message}` }] };
    }
  }
);

// Tool to get DNS records
server.registerTool(
  'list-dns-records',
  {
    title: 'List DNS Records',
    description: 'List DNS records for a zone',
    inputSchema: z.object({
      apiToken: z.string().describe('Cloudflare API token'),
      zoneId: z.string().describe('Zone ID')
    })
  },
  async ({ apiToken, zoneId }) => {
    try {
      const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`, {
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json'
        }
      });
      const data = await response.json();
      if (data.success) {
        const records = data.result.map((record: any) => ({
          id: record.id,
          type: record.type,
          name: record.name,
          content: record.content
        }));
        return { content: [{ type: 'text', text: JSON.stringify(records, null, 2) }] };
      } else {
        return { content: [{ type: 'text', text: `Error: ${data.errors.map((e: any) => e.message).join(', ')}` }] };
      }
    } catch (error) {
      return { content: [{ type: 'text', text: `Error: ${error.message}` }] };
    }
  }
);

const transport = new StdioServerTransport();
server.connect(transport).then(() => {
  console.error('Cloudflare MCP server running on stdio');
}).catch((error) => {
  console.error('Failed to start server:', error);
});