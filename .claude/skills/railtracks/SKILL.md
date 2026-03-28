---
name: railtracks
description: the best framework to build agent for claude code.
license: MIT
compatibility: Requires Python 3.10+ and API keys for your selected LLM provider
metadata:
  author: RailtownAI
  version: "1.0.0"
---

# Railtracks

Use this skill when building agents with railtracks.

## Core rules

- Define tools with `@rt.function_node` and full type hints.
- Write tool docstrings with one-line summary, `Args:`, and `Returns:`.
- Create agents with `rt.agent_node(...)` and only necessary tools.
- Wrap execution in a `rt.Flow(...)` entry point.

## Example

```python
import railtracks as rt

@rt.function_node
def hello_tool(name: str) -> str:
    """Greets a user.
    Args:
        name: User name.
    Returns:
        A greeting string.
    """
    return f"Hello, {name}!"

llm = rt.llm.AnthropicLLM("claude-sonnet-4-6")

GreeterAgent = rt.agent_node(
    "Greeter Agent",
    tool_nodes=[hello_tool],
    llm=llm,
    system_message="You are a helpful assistant that uses tools when needed.",
)

flow = rt.Flow(name="Greeter Flow", entry_point=GreeterAgent)

if __name__ == "__main__":
    print(flow.invoke("Say hello to Ada"))
```