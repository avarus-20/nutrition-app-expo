import { AuthForm } from '@/features/auth/AuthForm';

// FI: Palautuslinkki avaa uuden salasanan asetusnäkymän.
// RU: Ссылка восстановления открывает экран установки нового пароля.
export default function UpdatePasswordScreen() {
  return <AuthForm mode="update" />;
}
