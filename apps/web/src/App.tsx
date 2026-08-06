import { type SubmitEvent, useState } from "react";

import { ShoppingList } from "./shopping/shopping-list";
import { ZeroConnectionStatus } from "./zero/connection-status";

function App() {
  const [householdIdInput, setHouseholdIdInput] = useState("");
  const [householdId, setHouseholdId] = useState<string>();

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setHouseholdId(householdIdInput.trim());
  }

  return (
    <main>
      <ZeroConnectionStatus />

      <form onSubmit={handleSubmit}>
        <label htmlFor="household-id">Household ID</label>
        <input
          id="household-id"
          name="householdId"
          required
          value={householdIdInput}
          onChange={(event) => setHouseholdIdInput(event.target.value)}
        />
        <button type="submit">Open shopping list</button>
      </form>

      {householdId ? <ShoppingList householdId={householdId} /> : null}
    </main>
  );
}

export default App;
