import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Trash2, Edit, Eye, EyeOff } from 'lucide-react';
import { AdminConfig } from '@shared/schema';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

const configSchema = z.object({
  displayName: z.string().min(1, "Display name is required"),
  configValue: z.string().min(1, "Value is required"),
  sortOrder: z.number().default(0),
});

type ConfigForm = z.infer<typeof configSchema>;

interface AdminSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AdminSettingsModal({ isOpen, onClose }: AdminSettingsModalProps) {
  const [selectedConfig, setSelectedConfig] = useState<AdminConfig | null>(null);
  const [configToDelete, setConfigToDelete] = useState<AdminConfig | null>(null);
  const [activeTab, setActiveTab] = useState<'chart_types' | 'metric_types'>('chart_types');
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Fetch admin configurations
  const { data: chartTypes = [] } = useQuery<AdminConfig[]>({
    queryKey: ['/api/admin/config', 'chart_types'],
    queryFn: () => fetch('/api/admin/config?type=chart_types').then(res => res.json()),
    enabled: isOpen,
  });

  const { data: metricTypes = [] } = useQuery<AdminConfig[]>({
    queryKey: ['/api/admin/config', 'metric_types'],
    queryFn: () => fetch('/api/admin/config?type=metric_types').then(res => res.json()),
    enabled: isOpen,
  });

  // Mutations
  const createConfigMutation = useMutation({
    mutationFn: (data: { configType: string; displayName: string; configValue: string; sortOrder: number }) =>
      apiRequest('POST', '/api/admin/config', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/config'] });
      toast({ title: "Configuration added successfully" });
    },
    onError: () => {
      toast({ title: "Failed to add configuration", variant: "destructive" });
    }
  });

  const updateConfigMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: number; displayName?: string; configValue?: string; sortOrder?: number; isEnabled?: boolean }) =>
      apiRequest('PATCH', `/api/admin/config/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/config'] });
      toast({ title: "Configuration updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update configuration", variant: "destructive" });
    }
  });

  const deleteConfigMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest('DELETE', `/api/admin/config/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/config'] });
      toast({ title: "Configuration deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete configuration", variant: "destructive" });
    }
  });

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors, isSubmitting }
  } = useForm<ConfigForm>({
    resolver: zodResolver(configSchema),
    defaultValues: {
      displayName: '',
      configValue: '',
      sortOrder: 0,
    }
  });

  const onSubmit = async (data: ConfigForm) => {
    if (selectedConfig) {
      // Update existing config
      await updateConfigMutation.mutateAsync({
        id: selectedConfig.id,
        ...data
      });
    } else {
      // Create new config
      await createConfigMutation.mutateAsync({
        configType: activeTab,
        ...data
      });
    }
    
    reset();
    setSelectedConfig(null);
  };

  const handleEdit = (config: AdminConfig) => {
    setSelectedConfig(config);
    setValue('displayName', config.displayName);
    setValue('configValue', config.configValue);
    setValue('sortOrder', config.sortOrder || 0);
  };

  const handleToggleEnabled = async (config: AdminConfig) => {
    await updateConfigMutation.mutateAsync({
      id: config.id,
      isEnabled: !config.isEnabled
    });
  };

  const handleDelete = async () => {
    if (configToDelete) {
      await deleteConfigMutation.mutateAsync(configToDelete.id);
      setConfigToDelete(null);
    }
  };

  const getCurrentConfigs = () => {
    return activeTab === 'chart_types' ? chartTypes : metricTypes;
  };

  const getConfigTypeLabel = () => {
    return activeTab === 'chart_types' ? 'Chart Type' : 'Metric Type';
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="bg-slate-900 border border-slate-700 text-white max-w-4xl max-h-[80vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="text-cyan-400">Admin Settings</DialogTitle>
            <DialogDescription className="text-slate-400">
              Manage chart types and metric values for dashboard widgets.
            </DialogDescription>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)} className="h-full">
            <TabsList className="grid w-full grid-cols-2 bg-slate-800">
              <TabsTrigger value="chart_types" className="data-[state=active]:bg-slate-700">Chart Types</TabsTrigger>
              <TabsTrigger value="metric_types" className="data-[state=active]:bg-slate-700">Metric Types</TabsTrigger>
            </TabsList>

            <div className="flex gap-6 h-full mt-4">
              {/* Configuration List */}
              <div className="flex-1">
                <TabsContent value={activeTab} className="h-full m-0">
                  <div className="bg-slate-800 rounded-lg p-4 h-96 overflow-y-auto">
                    <h3 className="text-lg font-semibold mb-4 text-white">
                      Available {getConfigTypeLabel()}s
                    </h3>
                    
                    <div className="space-y-2">
                      {getCurrentConfigs().map((config) => (
                        <div
                          key={config.id}
                          className="flex items-center justify-between p-3 bg-slate-700 rounded-lg group hover:bg-slate-600 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div 
                              className={`w-2 h-2 rounded-full ${
                                config.isEnabled ? 'bg-green-400' : 'bg-gray-500'
                              }`}
                            />
                            <div>
                              <p className="font-medium text-white">{config.displayName}</p>
                              <p className="text-sm text-slate-400">{config.configValue}</p>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleToggleEnabled(config)}
                              className="p-1 h-auto text-slate-400 hover:text-white"
                              title={config.isEnabled ? 'Disable' : 'Enable'}
                            >
                              {config.isEnabled ? <Eye size={14} /> : <EyeOff size={14} />}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleEdit(config)}
                              className="p-1 h-auto text-slate-400 hover:text-cyan-400"
                              title="Edit"
                            >
                              <Edit size={14} />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setConfigToDelete(config)}
                              className="p-1 h-auto text-slate-400 hover:text-red-400"
                              title="Delete"
                            >
                              <Trash2 size={14} />
                            </Button>
                          </div>
                        </div>
                      ))}
                      
                      {getCurrentConfigs().length === 0 && (
                        <p className="text-slate-400 text-center py-8">
                          No {getConfigTypeLabel().toLowerCase()}s configured
                        </p>
                      )}
                    </div>
                  </div>
                </TabsContent>
              </div>

              {/* Add/Edit Form */}
              <div className="w-80">
                <div className="bg-slate-800 rounded-lg p-4">
                  <h3 className="text-lg font-semibold mb-4 text-white">
                    {selectedConfig ? 'Edit' : 'Add New'} {getConfigTypeLabel()}
                  </h3>
                  
                  <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="displayName" className="text-slate-300">Display Name</Label>
                      <Input
                        id="displayName"
                        {...register('displayName')}
                        placeholder="e.g., Line Chart"
                        className="bg-slate-700 border-slate-600 text-white"
                      />
                      {errors.displayName && (
                        <p className="text-red-400 text-sm">{errors.displayName.message}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="configValue" className="text-slate-300">Value</Label>
                      <Input
                        id="configValue"
                        {...register('configValue')}
                        placeholder="e.g., line"
                        className="bg-slate-700 border-slate-600 text-white"
                      />
                      {errors.configValue && (
                        <p className="text-red-400 text-sm">{errors.configValue.message}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="sortOrder" className="text-slate-300">Sort Order</Label>
                      <Input
                        id="sortOrder"
                        type="number"
                        {...register('sortOrder', { valueAsNumber: true })}
                        className="bg-slate-700 border-slate-600 text-white"
                      />
                    </div>

                    <div className="flex gap-2 pt-4">
                      {selectedConfig && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            reset();
                            setSelectedConfig(null);
                          }}
                          className="border-slate-600 text-slate-300 hover:bg-slate-700"
                        >
                          Cancel
                        </Button>
                      )}
                      <Button
                        type="submit"
                        disabled={isSubmitting}
                        className="bg-cyan-600 hover:bg-cyan-700 text-white flex-1"
                      >
                        <Plus size={16} className="mr-2" />
                        {selectedConfig ? 'Update' : 'Add'} {getConfigTypeLabel()}
                      </Button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!configToDelete} onOpenChange={() => setConfigToDelete(null)}>
        <AlertDialogContent className="bg-slate-900 border-slate-700 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Configuration</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-300">
              Are you sure you want to delete "{configToDelete?.displayName}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel 
              onClick={() => setConfigToDelete(null)}
              className="border-slate-600 text-slate-300 hover:bg-slate-800"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}