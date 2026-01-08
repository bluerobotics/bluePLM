import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'BluePLM Docs',
  description: 'BluePLM Documentation',
  
  themeConfig: {
    sidebar: [
      {
        text: 'Getting Started',
        items: [
          { text: 'Introduction', link: '/' },
          { text: 'Admin Setup', link: '/admin-setup' },
          { text: 'User Setup', link: '/user-setup' },
        ]
      },
      {
        text: 'Source Files',
        items: [
          { text: 'Explorer', link: '/source-files/explorer' },
          { text: 'Vaults', link: '/source-files/vaults' },
        ]
      },
      {
        text: 'Settings',
        items: [
          { text: 'Overview', link: '/settings/' },
          { text: 'Account', link: '/settings/account' },
          { text: 'Organization', link: '/settings/organization' },
          { text: 'Integrations', link: '/settings/integrations' },
        ]
      },
      {
        text: 'Extensions',
        collapsed: false,
        items: [
          { text: 'Overview', link: '/extensions/' },
          { text: 'Getting Started', link: '/extensions/getting-started' },
          { text: 'Extension Structure', link: '/extensions/structure' },
          { text: 'Manifest Reference', link: '/extensions/manifest' },
          { text: 'Permissions', link: '/extensions/permissions' },
          { text: 'Client API', link: '/extensions/client-api' },
          { text: 'Server API', link: '/extensions/server-api' },
          { text: 'AI Reference', link: '/extensions/ai-reference' },
          { text: 'Package Format', link: '/extensions/package-format' },
          { text: 'Publishing', link: '/extensions/publishing' },
          { text: 'Contributions', link: '/extensions/contributions' },
          { text: 'Best Practices', link: '/extensions/best-practices' },
          { text: 'Troubleshooting', link: '/extensions/troubleshooting' },
        ]
      }
    ],

    search: {
      provider: 'local'
    },

    editLink: {
      pattern: 'https://github.com/bluerobotics/bluePLM/edit/main/docs/:path',
      text: 'Edit this page'
    }
  }
})
