# Page snapshot

```yaml
- heading "E2E Family Dashboard" [level=1]
- paragraph: Welcome back, E2E Parent! Manage your family's virtual banking.
- text: "Timezone: Eastern Time (ET)"
- button "Settings"
- button "Sign Out"
- heading "Children's Accounts" [level=2]
- button "Add Child"
- link "View ChildAlpha details":
  - heading "View ChildAlpha details" [level=3]:
    - link "View ChildAlpha details":
      - /url: /child/child-abc
      - text: ChildAlpha (CA)
  - text: $12.34
  - button "Deposit"
  - button "Withdraw"
- region "Notifications (F8)":
  - list
- alert
- img
- text: 2 errors
- button "Hide Errors":
  - img
```