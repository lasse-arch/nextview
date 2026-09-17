/** Capitalizes the first letter of each word, lowercases the rest. */
export function titleCase(value: string): string {
  return value.replace(
    /\S+/g,
    (word) => word.charAt(0).toLocaleUpperCase("da") + word.slice(1).toLocaleLowerCase("da")
  );
}
