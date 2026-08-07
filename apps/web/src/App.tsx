import { useState } from "react";
import { HouseholdSwitcher } from "./households/household-switcher";
import { RecipeList } from "./recipes/recipe-list";
import { ShoppingList } from "./shopping/shopping-list";
import { ZeroConnectionStatus } from "./zero/connection-status";

function App() {
  const [householdId, setHouseholdId] = useState<string>();

  return (
    <main>
      <ZeroConnectionStatus />

      <HouseholdSwitcher
        selectedHouseholdId={householdId}
        onSelect={setHouseholdId}
      />

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
