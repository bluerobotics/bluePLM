import type { ConfigWithDepth } from '../types'

/**
 * Input configuration structure for building the tree
 */
export interface ConfigInput {
  name: string
  isActive?: boolean
  parentConfiguration?: string | null
  tabNumber?: string
  description?: string
}

/**
 * Build a flat tree structure from a list of configurations with parent references.
 * Returns the configurations sorted in tree order with depth information.
 * 
 * @param configs - Array of configurations with potential parent references
 * @returns Array of configurations with depth property for indentation
 */
export function buildConfigTreeFlat(configs: ConfigInput[]): ConfigWithDepth[] {
  interface TreeNode {
    config: ConfigInput
    children: TreeNode[]
    depth: number
  }
  
  const nodeMap = new Map<string, TreeNode>()
  const roots: TreeNode[] = []
  
  // Create nodes
  configs.forEach(config => {
    nodeMap.set(config.name, { config, children: [], depth: 0 })
  })
  
  // Build tree
  configs.forEach(config => {
    const node = nodeMap.get(config.name)!
    if (config.parentConfiguration && nodeMap.has(config.parentConfiguration)) {
      const parent = nodeMap.get(config.parentConfiguration)!
      node.depth = parent.depth + 1
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  })
  
  // Flatten (depth-first)
  const flatten = (nodes: TreeNode[]): ConfigWithDepth[] => {
    const result: ConfigWithDepth[] = []
    nodes.forEach(node => {
      result.push({ ...node.config, depth: node.depth })
      result.push(...flatten(node.children))
    })
    return result
  }
  
  return flatten(roots)
}
