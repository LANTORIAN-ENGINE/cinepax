// Un template, pas un layout : Next remonte ce niveau à chaque navigation.
// C'est la condition pour que l'animation d'entrée du formulaire rejoue au
// passage connexion ⇄ inscription — un layout, lui, serait préservé et le
// formulaire changerait de contenu sans bouger.
export default function AuthTemplate({ children }) {
  return <div className="auth-form-side">{children}</div>
}
