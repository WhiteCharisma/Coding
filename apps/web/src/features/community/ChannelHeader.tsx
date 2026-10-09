import { ArrowLeft, Hash, Lock, Menu as MenuIcon, Megaphone, Pin, Search, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { t } from '../../i18n';
import { cn } from '../../lib/cn';
import { useUi } from '../../stores/ui';
import { Button } from '../../components/ui/button';
import { Orb } from '../../components/ui/orb';
import { Tooltip } from '../../components/ui/tooltip';

interface ChannelHeaderProps {
  title: ReactNode;
  topic?: string;
  icon?: 'hash' | 'lock' | 'megaphone' | ReactNode;
  backTo: string;
  panelButtons?: ('members' | 'pins')[];
  activePanel: 'members' | 'pins' | null;
  onTogglePanel: (p: 'members' | 'pins') => void;
  searchTo?: string;
  extra?: ReactNode;
}

export function ChannelHeader({
  title,
  topic,
  icon = 'hash',
  backTo,
  panelButtons = ['pins', 'members'],
  activePanel,
  onTogglePanel,
  searchTo,
  extra,
}: ChannelHeaderProps) {
  const setDrawer = useUi((s) => s.setMobileSidebarOpen);
  const Icon = icon === 'hash' ? Hash : icon === 'lock' ? Lock : icon === 'megaphone' ? Megaphone : null;
  return (
    <header className="titlebar flex h-[var(--header-height)] shrink-0 items-center gap-1 px-2 md:gap-2 md:px-3">
      <Link
        to={backTo}
        aria-label={t('common.actions.back')}
        className="grid size-9 place-items-center rounded-md text-fg-muted hover:bg-hover hover:text-fg md:hidden"
      >
        <ArrowLeft className="size-5" />
      </Link>
      <Button
        variant="ghost"
        size="icon"
        className="hidden max-md:inline-flex"
        aria-label={t('shell.openSidebar')}
        onClick={() => setDrawer(true)}
      >
        <MenuIcon className="size-5" />
      </Button>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {Icon ? <Orb icon={Icon} size="sm" /> : icon}
        <h1 className="truncate font-display text-[15px] font-semibold tracking-tight text-fg">{title}</h1>
        {topic && (
          <>
            <span aria-hidden className="hidden h-5 w-px shrink-0 bg-line lg:block" />
            <p className="hidden min-w-0 truncate text-sm text-fg-muted lg:block" title={topic}>
              {topic}
            </p>
          </>
        )}
      </div>
      <div className="flex items-center gap-0.5">
        {extra}
        {panelButtons.includes('pins') && (
          <Tooltip content={t('chat.header.pins')}>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('shell.togglePins')}
              aria-pressed={activePanel === 'pins'}
              onClick={() => onTogglePanel('pins')}
              className={cn(
                activePanel === 'pins' && 'bg-selected text-fg shadow-[inset_0_1px_2px_var(--glass-edge-low)]',
              )}
            >
              <Pin className="size-[18px]" />
            </Button>
          </Tooltip>
        )}
        {panelButtons.includes('members') && (
          <Tooltip content={t('chat.header.members')}>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('shell.toggleMembers')}
              aria-pressed={activePanel === 'members'}
              onClick={() => onTogglePanel('members')}
              className={cn(
                activePanel === 'members' && 'bg-selected text-fg shadow-[inset_0_1px_2px_var(--glass-edge-low)]',
              )}
            >
              <Users className="size-[18px]" />
            </Button>
          </Tooltip>
        )}
        {searchTo && (
          <Tooltip content={t('chat.header.search')}>
            <Link
              to={searchTo}
              aria-label={t('chat.header.search')}
              className="grid size-9 place-items-center rounded-md text-fg-2 hover:bg-hover hover:text-fg"
            >
              <Search className="size-[18px]" />
            </Link>
          </Tooltip>
        )}
      </div>
    </header>
  );
}
