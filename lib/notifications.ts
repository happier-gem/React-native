import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

const CHANNEL_ID = "subscriptions";
/** Every reminder day any plan can choose (admin/lib/entitlements.ts). */
const ALL_REMINDER_DAYS = [1, 3, 7];
/** Used by the test notification only. */
const TEST_REMINDER_DAYS_BEFORE = 3;

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

/** One scheduled reminder per chosen day. (Before plan-based reminders there
 * was a single `renewal-<id>` reminder — still cancelled below.) */
const renewalReminderId = (subscriptionId: string, daysBefore?: number) =>
    daysBefore === undefined ? `renewal-${subscriptionId}` : `renewal-${subscriptionId}-${daysBefore}d`;
const canceledNotificationId = (subscriptionId: string) => `canceled-${subscriptionId}`;
const TEST_RENEWAL_ID = "test-renewal";
const TEST_CANCELED_ID = "test-canceled";

/**
 * Schedules a reminder for each of `daysBefore` (the user's plan settings,
 * e.g. [1] on Free, [3] or [7] on Starter, up to [1, 3, 7] on Pro). Replaces
 * any reminders already scheduled for this subscription.
 */
export async function scheduleRenewalReminder(
    subscriptionId: string,
    name: string,
    renewalDate: string,
    daysBefore: number[] = [1]
) {
    await cancelRenewalReminder(subscriptionId);

    for (const days of daysBefore) {
        const remindAt = new Date(renewalDate);
        remindAt.setDate(remindAt.getDate() - days);
        if (remindAt.getTime() <= Date.now()) continue;

        await Notifications.scheduleNotificationAsync({
            identifier: renewalReminderId(subscriptionId, days),
            content: {
                title: `${name} renews soon`,
                body: days === 1
                    ? `Your ${name} subscription renews tomorrow.`
                    : `Your ${name} subscription renews in ${days} days.`,
                autoDismiss: true,
            },
            trigger: {
                type: Notifications.SchedulableTriggerInputTypes.DATE,
                date: remindAt,
                channelId: CHANNEL_ID,
            },
        });
    }
}

export async function cancelRenewalReminder(subscriptionId: string) {
    const ids = [renewalReminderId(subscriptionId), ...ALL_REMINDER_DAYS.map((d) => renewalReminderId(subscriptionId, d))];
    await Promise.all(ids.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})));
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
            body: `Your Spotify subscription renews in ${TEST_REMINDER_DAYS_BEFORE} days.`,
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

/** Budget alert shown right away (e.g. "Music is over budget"). */
export async function notifyBudget(budgetId: string, title: string, body: string) {
    await Notifications.scheduleNotificationAsync({
        identifier: `budget-${budgetId}`,
        content: { title, body, autoDismiss: true },
        trigger: null,
    });
}
