# Persistent Shared Kill Switch Specification

## Mechanics
- **Storage:** Key `publishing:kill_switch:active` in shared Redis.
- **Propagation:** All application instances and background queue workers query this shared state immediately prior to publishing deals.
- **Fail-Safe Behavior:** If Redis is down, publishing fails closed.
- **Admin Control:** Can only be toggled by authenticated administrators.
- **Agent 3 Isolation:** Agent 3 has no permission or interface to toggle the kill switch.

