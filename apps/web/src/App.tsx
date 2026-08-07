import { type SubmitEvent, useState } from "react";
import { RecipeList } from "./recipes/recipe-list";
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
        <button type="submit">Open household</button>
      </form>

      {householdId && (
        <>
          <section>
            <h2>Shopping List</h2>
            <ShoppingList householdId={householdId} />
          </section>
          <section>
            <h2>Recipes</h2>
            <RecipeList householdId={householdId} />
          </section>
        </>
      )}
    </main>
  );
}

export default App;
