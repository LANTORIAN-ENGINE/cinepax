import { AdminPageSkeleton } from '@/components/skeletons'

// Frontière Suspense placée *sous* app/admin/layout.jsx : elle ne couvre que
// `children`. Quand on change de page depuis le rail de gauche, le code de la
// page demandée peut n'être pas encore arrivé ; c'est ce squelette qui occupe
// l'intervalle, dans la colonne de droite seule. La barre latérale, elle, ne
// bouge pas — elle est au-dessus de cette frontière.
export default function AdminLoading() {
  return <AdminPageSkeleton />
}
