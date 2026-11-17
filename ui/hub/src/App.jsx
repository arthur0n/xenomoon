// Hub page placeholder: brand word and title only. The real page is another issue.

/**
 * @param {{ title?: string }} props
 * @returns {import("react").JSX.Element}
 */
export default function App({ title = "Hub" }) {
  return (
    <main>
      <h1>XenomoonForge</h1>
      <p>{title}</p>
    </main>
  );
}
