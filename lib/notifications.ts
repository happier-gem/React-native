import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

const CHANNEL_ID = "subscriptions";
const RENEWAL_REMINDER_DAYS_BEFORE = 3;

Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldPlaySound: false,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
    }),
});

export async function configureNotificationChannel() {
    if (Platform.OS !== "android") return;
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: "Subscriptions",
        importance: Notifications.AndroidImportance.HIGH,
    });
}

export async function requestNotificationPermission() {
    const existing = await Notifications.getPermissionsAsync();
    if (existing.granted) return true;
    const requested = await Notifications.requestPermissionsAsync();
    return requested.granted;
}

const renewalReminderId = (subscriptionId: string) => `renewal-${subscriptionId}`;
const canceledNotificationId = (subscriptionId: string) => `canceled-${subscriptionId}`;
const TEST_RENEWAL_ID = "test-renewal";
const TEST_CANCELED_ID = "test-canceled";

export async function scheduleRenewalReminder(
    subscriptionId: string,
    name: string,
    renewalDate: string
) {
    await cancelRenewalReminder(subscriptionId);

    const remindAt = new Date(renewalDate);
    remindAt.setDate(remindAt.getDate() - RENEWAL_REMINDER_DAYS_BEFORE);
    if (remindAt.getTime() <= Date.now()) return;

    await Notifications.scheduleNotificationAsync({
        identifier: renewalReminderId(subscriptionId),
        content: {
            title: `${name} renews soon`,
            body: `Your ${name} subscription renews in ${RENEWAL_REMINDER_DAYS_BEFORE} days.`,
            autoDismiss: true,
        },
        trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: remindAt,
            channelId: CHANNEL_ID,
        },
    });
}

export async function cancelRenewalReminder(subscriptionId: string) {
    await Notifications.cancelScheduledNotificationAsync(renewalReminderId(subscriptionId)).catch(() => {});
}

export async function cancelAllScheduledNotifications() {
    await Notifications.cancelAllScheduledNotificationsAsync();
}

export async function notifySubscriptionCanceled(subscriptionId: string, name: string) {
    await Notifications.dismissNotificationAsync(canceledNotificationId(subscriptionId)).catch(() => {});
    await Notifications.scheduleNotificationAsync({
        identifier: canceledNotificationId(subscriptionId),
        content: {
            title: "Subscription canceled",
            body: `${name} has been canceled.`,
            autoDismiss: true,
        },
        trigger: null,
    });
}

export async function sendTestNotifications() {
    await Notifications.dismissNotificationAsync(TEST_RENEWAL_ID).catch(() => {});
    await Notifications.dismissNotificationAsync(TEST_CANCELED_ID).catch(() => {});

    await Notifications.scheduleNotificationAsync({
        identifier: TEST_RENEWAL_ID,
        content: {
            title: "Spotify renews soon",
            body: `Your Spotify subscription renews in ${RENEWAL_REMINDER_DAYS_BEFORE} days.`,
            autoDismiss: true,
        },
        trigger: null,
    });
    await Notifications.scheduleNotificationAsync({
        identifier: TEST_CANCELED_ID,
        content: {
            title: "Subscription canceled",
            body: "Figma has been canceled.",
            autoDismiss: true,
        },
        trigger: null,
    });
}

export async function dismissAllDisplayedNotifications() {
    await Notifications.dismissAllNotificationsAsync();
}
