/**
 * Admin/Debug interface for review system configuration
 * 
 * Provides a comprehensive interface for reviewing system status,
 * modifying configuration, and testing review functionality.
 */

import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    Switch,
    TextInput,
    Alert,
    StyleSheet,
    Modal,
} from 'react-native';
import {
    ReviewConfig,
    ReviewTrigger,
    DEFAULT_REVIEW_CONFIG,
} from '../lib/types/review-types';
import {
    configManager,
    DevModeOverrides,
    AdminDebugInfo,
} from '../lib/config-manager';
import { reviewManager } from '../lib/review-manager';

interface Props {
    visible: boolean;
    onClose: () => void;
}

/**
 * Debug panel component for review configuration management
 */
export const ReviewConfigDebugPanel: React.FC<Props> = ({ visible, onClose }) => {
    const [debugInfo, setDebugInfo] = useState<AdminDebugInfo | null>(null);
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<'config' | 'overrides' | 'status' | 'history'>('config');
    const [editingConfig, setEditingConfig] = useState<ReviewConfig | null>(null);
    const [devOverrides, setDevOverrides] = useState<DevModeOverrides>({});

    // Load debug information
    const loadDebugInfo = async () => {
        setLoading(true);
        try {
            const info = await configManager.getAdminDebugInfo();
            setDebugInfo(info);
            setEditingConfig(info.currentConfig);
            setDevOverrides(info.activeOverrides || {});
        } catch (error) {
            Alert.alert('Error', 'Failed to load debug information');
            console.error('Failed to load debug info:', error);
        } finally {
            setLoading(false);
        }
    };

    // Refresh data when panel opens
    useEffect(() => {
        if (visible) {
            loadDebugInfo();
        }
    }, [visible]);

    // Save configuration changes
    const saveConfiguration = async () => {
        if (!editingConfig) return;

        try {
            await configManager.updateConfig(editingConfig, 'user', 'Updated via debug panel');
            Alert.alert('Success', 'Configuration updated successfully');
            await loadDebugInfo();
        } catch (error) {
            Alert.alert('Error', 'Failed to save configuration');
            console.error('Failed to save config:', error);
        }
    };

    // Apply development mode overrides
    const applyDevOverrides = async () => {
        try {
            configManager.setDevModeOverrides(Object.keys(devOverrides).length > 0 ? devOverrides : null);
            Alert.alert('Success', 'Development overrides applied');
            await loadDebugInfo();
        } catch (error) {
            Alert.alert('Error', 'Failed to apply overrides');
            console.error('Failed to apply overrides:', error);
        }
    };

    // Reset configuration to defaults
    const resetToDefaults = () => {
        Alert.alert(
            'Reset Configuration',
            'Are you sure you want to reset all settings to defaults?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Reset',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await configManager.resetToDefaults('Reset via debug panel');
                            Alert.alert('Success', 'Configuration reset to defaults');
                            await loadDebugInfo();
                        } catch (error) {
                            Alert.alert('Error', 'Failed to reset configuration');
                            console.error('Failed to reset config:', error);
                        }
                    },
                },
            ]
        );
    };

    // Test review trigger
    const testReviewTrigger = async () => {
        try {
            const result = await reviewManager.checkAndTriggerReview({
                trigger: ReviewTrigger.APP_OPEN,
                userState: {
                    appOpenCount: 100,
                    successfulFoodLogs: 50,
                    streakDays: 30,
                    milestonesAchieved: ['7_day_streak'],
                    lastReviewPrompt: null,
                    lastReviewAction: null,
                },
                appState: {
                    isLoading: false,
                    hasErrors: false,
                    currentScreen: 'debug',
                    sessionStartTime: new Date(),
                },
            });
            Alert.alert('Test Result', result ? 'Review triggered successfully' : 'Review not triggered');
        } catch (error) {
            Alert.alert('Error', 'Failed to test review trigger');
            console.error('Failed to test review:', error);
        }
    };

    // Export configuration
    const exportConfiguration = () => {
        try {
            const exportData = configManager.exportConfiguration();
            Alert.alert(
                'Export Configuration',
                `Configuration exported:\n\nVersion: ${exportData.metadata.version}\nDate: ${exportData.metadata.exportDate.toLocaleString()}\n\nConfiguration data has been logged to console.`
            );
            console.log('Exported Configuration:', JSON.stringify(exportData, null, 2));
        } catch (error) {
            Alert.alert('Error', 'Failed to export configuration');
            console.error('Failed to export config:', error);
        }
    };

    // Render configuration tab
    const renderConfigTab = () => {
        if (!editingConfig) return null;

        return (
            <ScrollView style={styles.tabContent}>
                <Text style={styles.sectionTitle}>Trigger Settings</Text>
                
                {Object.entries(editingConfig.triggers).map(([trigger, settings]) => (
                    <View key={trigger} style={styles.triggerSection}>
                        <Text style={styles.triggerTitle}>{trigger.replace(/_/g, ' ').toUpperCase()}</Text>
                        
                        <View style={styles.settingRow}>
                            <Text style={styles.settingLabel}>Enabled</Text>
                            <Switch
                                value={settings.enabled}
                                onValueChange={(value) => {
                                    setEditingConfig({
                                        ...editingConfig,
                                        triggers: {
                                            ...editingConfig.triggers,
                                            [trigger]: { ...settings, enabled: value },
                                        },
                                    });
                                }}
                            />
                        </View>

                        {'minimumCount' in settings && (
                            <View style={styles.settingRow}>
                                <Text style={styles.settingLabel}>Minimum Count</Text>
                                <TextInput
                                    style={styles.numberInput}
                                    value={String(settings.minimumCount)}
                                    onChangeText={(text) => {
                                        const count = parseInt(text) || 0;
                                        setEditingConfig({
                                            ...editingConfig,
                                            triggers: {
                                                ...editingConfig.triggers,
                                                [trigger]: { ...settings, minimumCount: count },
                                            },
                                        });
                                    }}
                                    keyboardType="numeric"
                                />
                            </View>
                        )}

                        {'streakDays' in settings && (
                            <View style={styles.settingRow}>
                                <Text style={styles.settingLabel}>Streak Days</Text>
                                <TextInput
                                    style={styles.textInput}
                                    value={settings.streakDays?.join(', ') || ''}
                                    onChangeText={(text) => {
                                        const days = text.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
                                        setEditingConfig({
                                            ...editingConfig,
                                            triggers: {
                                                ...editingConfig.triggers,
                                                [trigger]: { ...settings, streakDays: days },
                                            },
                                        });
                                    }}
                                    placeholder="7, 14, 30, 60, 90"
                                />
                            </View>
                        )}

                        {'milestones' in settings && (
                            <View style={styles.settingRow}>
                                <Text style={styles.settingLabel}>Milestones</Text>
                                <TextInput
                                    style={styles.textInput}
                                    value={settings.milestones?.join(', ') || ''}
                                    onChangeText={(text) => {
                                        const milestones = text.split(',').map(s => s.trim()).filter(s => s.length > 0);
                                        setEditingConfig({
                                            ...editingConfig,
                                            triggers: {
                                                ...editingConfig.triggers,
                                                [trigger]: { ...settings, milestones },
                                            },
                                        });
                                    }}
                                    placeholder="7_day_streak, 30_day_streak"
                                />
                            </View>
                        )}
                    </View>
                ))}

                <Text style={styles.sectionTitle}>General Settings</Text>
                
                <View style={styles.settingRow}>
                    <Text style={styles.settingLabel}>Cooldown Period (days)</Text>
                    <TextInput
                        style={styles.numberInput}
                        value={String(editingConfig.cooldownPeriod)}
                        onChangeText={(text) => {
                            const days = parseInt(text) || 0;
                            setEditingConfig({ ...editingConfig, cooldownPeriod: days });
                        }}
                        keyboardType="numeric"
                    />
                </View>

                <View style={styles.settingRow}>
                    <Text style={styles.settingLabel}>Max Prompts Per User</Text>
                    <TextInput
                        style={styles.numberInput}
                        value={String(editingConfig.maxPromptsPerUser)}
                        onChangeText={(text) => {
                            const max = parseInt(text) || 1;
                            setEditingConfig({ ...editingConfig, maxPromptsPerUser: max });
                        }}
                        keyboardType="numeric"
                    />
                </View>

                <View style={styles.settingRow}>
                    <Text style={styles.settingLabel}>Debug Mode</Text>
                    <Switch
                        value={editingConfig.debugMode}
                        onValueChange={(value) => {
                            setEditingConfig({ ...editingConfig, debugMode: value });
                        }}
                    />
                </View>

                <TouchableOpacity style={styles.saveButton} onPress={saveConfiguration}>
                    <Text style={styles.saveButtonText}>Save Configuration</Text>
                </TouchableOpacity>
            </ScrollView>
        );
    };

    // Render development overrides tab
    const renderOverridesTab = () => (
        <ScrollView style={styles.tabContent}>
            <Text style={styles.sectionTitle}>Development Mode Overrides</Text>
            
            <View style={styles.settingRow}>
                <Text style={styles.settingLabel}>Force Show Review</Text>
                <Switch
                    value={devOverrides.forceShowReview || false}
                    onValueChange={(value) => {
                        setDevOverrides({ ...devOverrides, forceShowReview: value });
                    }}
                />
            </View>

            <View style={styles.settingRow}>
                <Text style={styles.settingLabel}>Skip Cooldown Period</Text>
                <Switch
                    value={devOverrides.skipCooldownPeriod || false}
                    onValueChange={(value) => {
                        setDevOverrides({ ...devOverrides, skipCooldownPeriod: value });
                    }}
                />
            </View>

            <View style={styles.settingRow}>
                <Text style={styles.settingLabel}>Override Minimum App Opens</Text>
                <TextInput
                    style={styles.numberInput}
                    value={String(devOverrides.minimumAppOpens || '')}
                    onChangeText={(text) => {
                        const count = text ? parseInt(text) || 0 : undefined;
                        setDevOverrides({ ...devOverrides, minimumAppOpens: count });
                    }}
                    keyboardType="numeric"
                    placeholder="Leave empty to use config"
                />
            </View>

            <View style={styles.settingRow}>
                <Text style={styles.settingLabel}>Enable Verbose Logging</Text>
                <Switch
                    value={devOverrides.enableVerboseLogging || false}
                    onValueChange={(value) => {
                        setDevOverrides({ ...devOverrides, enableVerboseLogging: value });
                    }}
                />
            </View>

            <View style={styles.settingRow}>
                <Text style={styles.settingLabel}>Simulate Errors</Text>
                <Switch
                    value={devOverrides.simulateErrors || false}
                    onValueChange={(value) => {
                        setDevOverrides({ ...devOverrides, simulateErrors: value });
                    }}
                />
            </View>

            <TouchableOpacity style={styles.saveButton} onPress={applyDevOverrides}>
                <Text style={styles.saveButtonText}>Apply Overrides</Text>
            </TouchableOpacity>

            <TouchableOpacity 
                style={[styles.saveButton, styles.clearButton]} 
                onPress={() => {
                    setDevOverrides({});
                    configManager.clearDevModeOverrides();
                    Alert.alert('Success', 'Development overrides cleared');
                }}
            >
                <Text style={styles.saveButtonText}>Clear All Overrides</Text>
            </TouchableOpacity>
        </ScrollView>
    );

    // Render system status tab
    const renderStatusTab = () => {
        if (!debugInfo) return null;

        return (
            <ScrollView style={styles.tabContent}>
                <Text style={styles.sectionTitle}>System Status</Text>
                
                <View style={styles.statusRow}>
                    <Text style={styles.statusLabel}>Initialized</Text>
                    <Text style={[styles.statusValue, debugInfo.systemStatus.isInitialized ? styles.statusGood : styles.statusBad]}>
                        {debugInfo.systemStatus.isInitialized ? 'Yes' : 'No'}
                    </Text>
                </View>

                <View style={styles.statusRow}>
                    <Text style={styles.statusLabel}>Config Version</Text>
                    <Text style={styles.statusValue}>{debugInfo.systemStatus.configVersion}</Text>
                </View>

                <View style={styles.statusRow}>
                    <Text style={styles.statusLabel}>Last Update</Text>
                    <Text style={styles.statusValue}>
                        {debugInfo.systemStatus.lastConfigUpdate?.toLocaleString() || 'Never'}
                    </Text>
                </View>

                <View style={styles.statusRow}>
                    <Text style={styles.statusLabel}>Active Overrides</Text>
                    <Text style={[styles.statusValue, debugInfo.systemStatus.hasActiveOverrides ? styles.statusWarning : styles.statusGood]}>
                        {debugInfo.systemStatus.hasActiveOverrides ? 'Yes' : 'No'}
                    </Text>
                </View>

                <View style={styles.statusRow}>
                    <Text style={styles.statusLabel}>Storage Available</Text>
                    <Text style={[styles.statusValue, debugInfo.systemStatus.storageAvailable ? styles.statusGood : styles.statusBad]}>
                        {debugInfo.systemStatus.storageAvailable ? 'Yes' : 'No'}
                    </Text>
                </View>

                <Text style={styles.sectionTitle}>Performance Metrics</Text>
                
                <View style={styles.statusRow}>
                    <Text style={styles.statusLabel}>Config Load Time</Text>
                    <Text style={styles.statusValue}>{debugInfo.performanceMetrics.configLoadTime}ms</Text>
                </View>

                <View style={styles.statusRow}>
                    <Text style={styles.statusLabel}>Config Save Time</Text>
                    <Text style={styles.statusValue}>{debugInfo.performanceMetrics.configSaveTime}ms</Text>
                </View>

                <View style={styles.statusRow}>
                    <Text style={styles.statusLabel}>Total Updates</Text>
                    <Text style={styles.statusValue}>{debugInfo.performanceMetrics.totalConfigUpdates}</Text>
                </View>

                <View style={styles.statusRow}>
                    <Text style={styles.statusLabel}>Average Update Time</Text>
                    <Text style={styles.statusValue}>{debugInfo.performanceMetrics.averageUpdateTime.toFixed(1)}ms</Text>
                </View>

                <View style={styles.buttonRow}>
                    <TouchableOpacity style={styles.actionButton} onPress={testReviewTrigger}>
                        <Text style={styles.actionButtonText}>Test Review Trigger</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity style={styles.actionButton} onPress={exportConfiguration}>
                        <Text style={styles.actionButtonText}>Export Config</Text>
                    </TouchableOpacity>
                </View>

                <TouchableOpacity style={[styles.saveButton, styles.resetButton]} onPress={resetToDefaults}>
                    <Text style={styles.saveButtonText}>Reset to Defaults</Text>
                </TouchableOpacity>
            </ScrollView>
        );
    };

    // Render configuration history tab
    const renderHistoryTab = () => {
        if (!debugInfo) return null;

        return (
            <ScrollView style={styles.tabContent}>
                <Text style={styles.sectionTitle}>Configuration History</Text>
                
                {debugInfo.configHistory.length === 0 ? (
                    <Text style={styles.emptyText}>No configuration changes recorded</Text>
                ) : (
                    debugInfo.configHistory.slice().reverse().map((entry, index) => (
                        <View key={index} style={styles.historyEntry}>
                            <View style={styles.historyHeader}>
                                <Text style={styles.historyTimestamp}>
                                    {entry.timestamp.toLocaleString()}
                                </Text>
                                <Text style={[styles.historySource, styles[`source_${entry.source}`]]}>
                                    {entry.source.replace(/_/g, ' ').toUpperCase()}
                                </Text>
                            </View>
                            
                            {entry.reason && (
                                <Text style={styles.historyReason}>{entry.reason}</Text>
                            )}
                            
                            <Text style={styles.historyChanges}>
                                Changes: {JSON.stringify(entry.changes, null, 2)}
                            </Text>
                        </View>
                    ))
                )}
            </ScrollView>
        );
    };

    if (!visible) return null;

    return (
        <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
            <View style={styles.container}>
                <View style={styles.header}>
                    <Text style={styles.title}>Review System Debug Panel</Text>
                    <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                        <Text style={styles.closeButtonText}>Close</Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.tabBar}>
                    {(['config', 'overrides', 'status', 'history'] as const).map((tab) => (
                        <TouchableOpacity
                            key={tab}
                            style={[styles.tab, activeTab === tab && styles.activeTab]}
                            onPress={() => setActiveTab(tab)}
                        >
                            <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
                                {tab.charAt(0).toUpperCase() + tab.slice(1)}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {loading ? (
                    <View style={styles.loadingContainer}>
                        <Text>Loading debug information...</Text>
                    </View>
                ) : (
                    <>
                        {activeTab === 'config' && renderConfigTab()}
                        {activeTab === 'overrides' && renderOverridesTab()}
                        {activeTab === 'status' && renderStatusTab()}
                        {activeTab === 'history' && renderHistoryTab()}
                    </>
                )}
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
    },
    title: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#333',
    },
    closeButton: {
        padding: 8,
    },
    closeButtonText: {
        color: '#007AFF',
        fontSize: 16,
    },
    tabBar: {
        flexDirection: 'row',
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
    },
    tab: {
        flex: 1,
        paddingVertical: 12,
        alignItems: 'center',
    },
    activeTab: {
        borderBottomWidth: 2,
        borderBottomColor: '#007AFF',
    },
    tabText: {
        fontSize: 14,
        color: '#666',
    },
    activeTabText: {
        color: '#007AFF',
        fontWeight: '600',
    },
    tabContent: {
        flex: 1,
        padding: 16,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#333',
        marginBottom: 12,
        marginTop: 8,
    },
    triggerSection: {
        backgroundColor: '#fff',
        padding: 12,
        marginBottom: 12,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#e0e0e0',
    },
    triggerTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#333',
        marginBottom: 8,
    },
    settingRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 8,
    },
    settingLabel: {
        fontSize: 14,
        color: '#333',
        flex: 1,
    },
    numberInput: {
        borderWidth: 1,
        borderColor: '#ddd',
        borderRadius: 4,
        padding: 8,
        width: 80,
        textAlign: 'center',
        backgroundColor: '#fff',
    },
    textInput: {
        borderWidth: 1,
        borderColor: '#ddd',
        borderRadius: 4,
        padding: 8,
        flex: 1,
        marginLeft: 12,
        backgroundColor: '#fff',
    },
    saveButton: {
        backgroundColor: '#007AFF',
        padding: 12,
        borderRadius: 8,
        alignItems: 'center',
        marginTop: 16,
    },
    saveButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    clearButton: {
        backgroundColor: '#FF9500',
        marginTop: 8,
    },
    resetButton: {
        backgroundColor: '#FF3B30',
    },
    statusRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
    },
    statusLabel: {
        fontSize: 14,
        color: '#333',
    },
    statusValue: {
        fontSize: 14,
        fontWeight: '500',
    },
    statusGood: {
        color: '#34C759',
    },
    statusWarning: {
        color: '#FF9500',
    },
    statusBad: {
        color: '#FF3B30',
    },
    buttonRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 16,
    },
    actionButton: {
        backgroundColor: '#34C759',
        padding: 12,
        borderRadius: 8,
        flex: 0.48,
        alignItems: 'center',
    },
    actionButtonText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
    },
    emptyText: {
        fontSize: 14,
        color: '#666',
        textAlign: 'center',
        marginTop: 20,
    },
    historyEntry: {
        backgroundColor: '#fff',
        padding: 12,
        marginBottom: 8,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#e0e0e0',
    },
    historyHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    historyTimestamp: {
        fontSize: 12,
        color: '#666',
    },
    historySource: {
        fontSize: 12,
        fontWeight: '600',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
    },
    source_user: {
        backgroundColor: '#007AFF',
        color: '#fff',
    },
    source_system: {
        backgroundColor: '#34C759',
        color: '#fff',
    },
    source_dev_override: {
        backgroundColor: '#FF9500',
        color: '#fff',
    },
    source_reset: {
        backgroundColor: '#FF3B30',
        color: '#fff',
    },
    historyReason: {
        fontSize: 12,
        color: '#333',
        fontStyle: 'italic',
        marginBottom: 4,
    },
    historyChanges: {
        fontSize: 11,
        color: '#666',
        fontFamily: 'monospace',
    },
});