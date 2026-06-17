import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar, View, Text, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import DashboardScreen from './src/screens/DashboardScreen';
import AlertsScreen from './src/screens/AlertsScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import { SafeSeatProvider } from './src/hooks/useSafeSeat';
import { COLORS } from './src/utils/theme';

const Tab = createBottomTabNavigator();

const ICONS: Record<string, string> = {
  Dashboard: '🏠',
  Alerts: '🔔',
  Settings: '⚙️',
};

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  return (
    <View style={[styles.tabIcon, focused && styles.tabIconActive]}>
      <Text style={styles.tabIconGlyph}>{ICONS[name] ?? '○'}</Text>
      <Text style={[styles.tabLabel, focused && styles.tabLabelActive]}>
        {name}
      </Text>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <SafeSeatProvider>
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />
        <NavigationContainer>
          <Tab.Navigator
            screenOptions={({ route }) => ({
              headerShown: false,
              tabBarShowLabel: false,
              tabBarStyle: styles.tabBar,
              tabBarIcon: ({ focused }) => (
                <TabIcon name={route.name} focused={focused} />
              ),
            })}
          >
            <Tab.Screen name="Dashboard" component={DashboardScreen} />
            <Tab.Screen name="Alerts" component={AlertsScreen} />
            <Tab.Screen name="Settings" component={SettingsScreen} />
          </Tab.Navigator>
        </NavigationContainer>
      </SafeSeatProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    height: 76,
    paddingTop: 8,
    paddingBottom: 10,
    paddingHorizontal: 16,
  },
  tabIcon: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 14,
  },
  tabIconActive: {
    backgroundColor: COLORS.shieldBlueDim,
  },
  tabIconGlyph: {
    fontSize: 15,
  },
  tabLabel: {
    fontSize: 12,
    color: COLORS.muted,
    fontWeight: '500',
  },
  tabLabelActive: {
    color: COLORS.shieldBlue,
    fontWeight: '700',
  },
});
