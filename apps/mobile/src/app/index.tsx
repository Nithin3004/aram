import { Redirect } from 'expo-router';
import { useApp } from '../lib/store';

export default function Index() {
  const { signedIn } = useApp();
  return <Redirect href={signedIn ? '/home' : '/login'} />;
}
