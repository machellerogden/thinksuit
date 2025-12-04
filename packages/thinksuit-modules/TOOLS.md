# ThinkSuit Core Module Tools

The `thinksuit/mu` module provides filesystem tools via the MCP (Model Context Protocol) filesystem server.

## Default Enabled Tools

These 10 tools are enabled by default when using the core module:

- **`read_text_file`** - Read text file contents
- **`read_media_file`** - Read binary/media file contents
- **`read_multiple_files`** - Read multiple files at once
- **`write_file`** - Create a new file or overwrite an existing one
- **`edit_file`** - Modify specific parts of an existing file
- **`list_directory`** - List files and subdirectories in a directory
- **`directory_tree`** - Display a recursive tree structure of directories
- **`create_directory`** - Create a new directory (with parent directories if needed)
- **`move_file`** - Move or rename files and directories
- **`search_files`** - Search for files matching patterns within directories

## Additional Available Tools

These additional tools are discovered from the MCP filesystem server and can be enabled via the `--tools` flag:

- **`list_directory_with_sizes`** - List directory with file sizes and metadata
- **`get_file_info`** - Get detailed metadata about a specific file
- **`list_allowed_directories`** - Show which directories the MCP server can access

## Using Tools

### Via CLI

```bash
# Use default tools
npm run exec -- "List the files in this directory"

# Specify specific tools
npm run exec -- --tools=read_text_file,read_media_file,read_multiple_files,list_directory "Show me what's here"

# Use all available tools
npm run exec -- --tools=read_text_file,read_media_file,read_multiple_files,write_file,edit_file,list_directory,directory_tree,create_directory,move_file,search_files,list_directory_with_sizes,get_file_info,list_allowed_directories "Analyze this codebase"
```

### Tool Discovery

The actual tools available are discovered at runtime from the MCP servers configured in the module. The module's `mcpServers` configuration determines which MCP servers are started:

```javascript
mcpServers: {
    filesystem: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', process.cwd()]
    }
}
```

### Tool Policy

Users can control tool availability through:
1. **Module defaults** - The tools listed in the module's `tools` array
2. **CLI override** - Using `--tools` flag to specify an allowlist
3. **Config file** - Setting tools in `~/.thinksuit.json`

When tools are specified via CLI or config, they act as an allowlist - only those specific tools will be available to the agent, even if more tools are discovered from the MCP server.

## Security

The MCP filesystem server enforces security boundaries:
- Can only access files within allowed directories
- The working directory is set to `process.cwd()` by default
- Additional directories can be configured if needed

## Extending with Custom Tools

To add tools from other MCP servers:

1. Add the MCP server to your module's `mcpServers` configuration
2. Update the `tools` array to include the tool names you want to enable
3. The tools will be discovered automatically at runtime

Example:
```javascript
mcpServers: {
    filesystem: { /* ... */ },
    git: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-git']
    }
},
tools: [
    // filesystem tools
    'read_text_file',
    'read_media_file',
    'read_multiple_files',
    'write_file',
    // git tools
    'git_status',
    'git_diff'
]
```
